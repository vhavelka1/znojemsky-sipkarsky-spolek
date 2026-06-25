import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { getAppRequester, hasAtLeastRole } from "@/lib/appAuth";

const galleryBucket = "gallery";
const maximumPhotoSize = 5 * 1024 * 1024;
const maximumPhotosPerAlbum = 100;
const allowedPhotoTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

type GalleryPhotoRow = {
  id: string;
  album_id: string;
  public_url: string;
  width: number | null;
  height: number | null;
  sort_order: number;
};

type GalleryAlbumRow = {
  id: string;
  title: string;
  description: string | null;
  event_date: string | null;
  created_at: string;
  created_by_player_id: string | null;
};

function stringValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function integerValue(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function gallerySchemaError(error: { message?: string } | null | undefined) {
  const message = error?.message ?? "";
  return message.includes("gallery_albums") || message.includes("gallery_photos") || message.includes("bucket")
    ? "Nejprve spusťte SQL soubor supabase/apply_gallery_in_dashboard.sql v Supabase SQL Editoru."
    : message;
}

export async function GET(request: Request) {
  try {
    const supabase = createSupabaseAdminClient();
    const requester = await getAppRequester(request).catch(() => null);

    const { data: albums, error: albumsError } = await supabase
      .from("gallery_albums")
      .select("id, title, description, event_date, created_at, created_by_player_id")
      .is("deleted_at", null)
      .order("event_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (albumsError) {
      return NextResponse.json({ error: gallerySchemaError(albumsError), albums: [] }, { status: 500 });
    }

    const albumIds = (albums ?? []).map((album) => album.id);
    const { data: photos, error: photosError } = albumIds.length
      ? await supabase
          .from("gallery_photos")
          .select("id, album_id, public_url, width, height, sort_order")
          .in("album_id", albumIds)
          .is("deleted_at", null)
          .order("sort_order", { ascending: true })
      : { data: [] as GalleryPhotoRow[], error: null };

    if (photosError) {
      return NextResponse.json({ error: gallerySchemaError(photosError), albums: [] }, { status: 500 });
    }

    const photosByAlbum = new Map<string, GalleryPhotoRow[]>();
    (photos ?? []).forEach((photo) => {
      photosByAlbum.set(photo.album_id, [...(photosByAlbum.get(photo.album_id) ?? []), photo]);
    });

    return NextResponse.json({
      currentUser: requester
        ? {
            displayName: requester.displayName,
            role: requester.role,
            canUpload: hasAtLeastRole(requester.role, "player"),
            canDelete: requester.role === "admin",
          }
        : null,
      albums: ((albums ?? []) as GalleryAlbumRow[]).map((album) => ({
        id: album.id,
        title: album.title,
        description: album.description,
        eventDate: album.event_date,
        createdAt: album.created_at,
        photos: (photosByAlbum.get(album.id) ?? []).map((photo) => ({
          id: photo.id,
          publicUrl: photo.public_url,
          width: photo.width,
          height: photo.height,
          sortOrder: photo.sort_order,
        })),
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Galerii se nepodařilo načíst.", albums: [] },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const requester = await getAppRequester(request);

    if (!requester || !hasAtLeastRole(requester.role, "player")) {
      return NextResponse.json(
        { error: "Nahrávání alb je dostupné pouze přihlášeným hráčům a vyšším rolím." },
        { status: 403 },
      );
    }

    const formData = await request.formData();
    const title = stringValue(formData.get("title"));
    const description = stringValue(formData.get("description"));
    const eventDate = stringValue(formData.get("eventDate"));
    const files = formData.getAll("photos").filter((value): value is File => value instanceof File);

    if (!title) {
      return NextResponse.json({ error: "Zadejte název alba." }, { status: 400 });
    }

    if (!eventDate) {
      return NextResponse.json({ error: "Vyberte datum alba." }, { status: 400 });
    }

    if (files.length === 0) {
      return NextResponse.json({ error: "Vyberte alespoň jednu fotku." }, { status: 400 });
    }

    if (files.length > maximumPhotosPerAlbum) {
      return NextResponse.json({ error: `Jedno album může obsahovat nejvýše ${maximumPhotosPerAlbum} fotek.` }, { status: 400 });
    }

    const invalidFile = files.find((file) => !allowedPhotoTypes.has(file.type) || file.size > maximumPhotoSize);
    if (invalidFile) {
      return NextResponse.json(
        { error: "Fotky musí být ve formátu JPG, PNG nebo WebP a po zmenšení mohou mít nejvýše 5 MB." },
        { status: 400 },
      );
    }

    const supabase = createSupabaseAdminClient();
    const { data: album, error: albumError } = await supabase
      .from("gallery_albums")
      .insert({
        title,
        description: description || null,
        event_date: eventDate,
        created_by_user_id: requester.userId,
        created_by_player_id: requester.playerId,
      })
      .select("id, title, description, event_date, created_at")
      .single();

    if (albumError) {
      return NextResponse.json({ error: gallerySchemaError(albumError) }, { status: 500 });
    }

    const uploadedPaths: string[] = [];
    const photoRows = [];

    for (const [index, file] of files.entries()) {
      const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const storagePath = `${album.id}/${crypto.randomUUID()}.${extension}`;
      const uploadResult = await supabase.storage.from(galleryBucket).upload(storagePath, file, {
        cacheControl: "31536000",
        contentType: file.type,
        upsert: false,
      });

      if (uploadResult.error) {
        await Promise.all(uploadedPaths.map((path) => supabase.storage.from(galleryBucket).remove([path])));
        await supabase.from("gallery_albums").delete().eq("id", album.id);
        return NextResponse.json({ error: gallerySchemaError(uploadResult.error) }, { status: 500 });
      }

      uploadedPaths.push(storagePath);
      const publicUrl = supabase.storage.from(galleryBucket).getPublicUrl(storagePath).data.publicUrl;
      photoRows.push({
        album_id: album.id,
        storage_path: storagePath,
        public_url: publicUrl,
        width: integerValue(formData.get(`width_${index}`)),
        height: integerValue(formData.get(`height_${index}`)),
        sort_order: index,
      });
    }

    const { data: photos, error: photosError } = await supabase
      .from("gallery_photos")
      .insert(photoRows)
      .select("id, public_url, width, height, sort_order");

    if (photosError) {
      await Promise.all(uploadedPaths.map((path) => supabase.storage.from(galleryBucket).remove([path])));
      await supabase.from("gallery_albums").delete().eq("id", album.id);
      return NextResponse.json({ error: gallerySchemaError(photosError) }, { status: 500 });
    }

    return NextResponse.json({
      album: {
        id: album.id,
        title: album.title,
        description: album.description,
        eventDate: album.event_date,
        createdAt: album.created_at,
        photos: (photos ?? []).map((photo) => ({
          id: photo.id,
          publicUrl: photo.public_url,
          width: photo.width,
          height: photo.height,
          sortOrder: photo.sort_order,
        })),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Album se nepodařilo nahrát." },
      { status: 500 },
    );
  }
}
