import { NextResponse } from "next/server";
import { getAppRequester } from "@/lib/appAuth";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

const galleryBucket = "gallery";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function gallerySchemaError(error: { message?: string } | null | undefined) {
  const message = error?.message ?? "";
  return message.includes("gallery_albums") || message.includes("gallery_photos") || message.includes("bucket")
    ? "Nejprve spusťte SQL soubor supabase/apply_gallery_in_dashboard.sql v Supabase SQL Editoru."
    : message;
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const requester = await getAppRequester(request);

    if (requester?.role !== "admin") {
      return NextResponse.json({ error: "Album může smazat pouze administrátor." }, { status: 403 });
    }

    const { id } = await context.params;
    const supabase = createSupabaseAdminClient();
    const { data: photos, error: photosReadError } = await supabase
      .from("gallery_photos")
      .select("storage_path")
      .eq("album_id", id)
      .is("deleted_at", null);

    if (photosReadError) {
      return NextResponse.json({ error: gallerySchemaError(photosReadError) }, { status: 500 });
    }

    const now = new Date().toISOString();
    const [photosUpdate, albumUpdate] = await Promise.all([
      supabase.from("gallery_photos").update({ deleted_at: now }).eq("album_id", id).is("deleted_at", null),
      supabase.from("gallery_albums").update({ deleted_at: now }).eq("id", id).is("deleted_at", null),
    ]);

    const updateError = photosUpdate.error ?? albumUpdate.error;
    if (updateError) {
      return NextResponse.json({ error: gallerySchemaError(updateError) }, { status: 500 });
    }

    const storagePaths = (photos ?? []).map((photo) => photo.storage_path).filter(Boolean);
    if (storagePaths.length > 0) {
      await supabase.storage.from(galleryBucket).remove(storagePaths);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Album se nepodařilo smazat." },
      { status: 500 },
    );
  }
}
