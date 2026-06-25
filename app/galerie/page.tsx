"use client";

import Image from "next/image";
import Link from "next/link";
import { PublicHeader as SharedPublicHeader } from "@/components/public/PublicShell";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type CurrentUser = {
  displayName: string;
  role: "guest" | "player" | "captain" | "moderator" | "admin";
  canUpload: boolean;
  canDelete: boolean;
};

type GalleryPhoto = {
  id: string;
  publicUrl: string;
  width: number | null;
  height: number | null;
  sortOrder: number;
};

type GalleryAlbum = {
  id: string;
  title: string;
  description: string | null;
  eventDate: string | null;
  createdAt: string;
  photos: GalleryPhoto[];
};

type GalleryPayload = {
  currentUser: CurrentUser | null;
  albums: GalleryAlbum[];
  error?: string;
};

type PreparedPhoto = {
  file: File;
  previewUrl: string;
  width: number;
  height: number;
};


const roleLabels: Record<CurrentUser["role"], string> = {
  guest: "host",
  player: "hráč",
  captain: "kapitán",
  moderator: "moderátor",
  admin: "administrátor",
};

function PublicHeader() {
  return <SharedPublicHeader activeHref="/galerie" />;
}

function PublicFooter() {
  return (
    <footer className="bg-[#061A3A] text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <div className="flex items-center gap-4">
          <Image
            alt="Logo Znojemského šipkařského spolku"
            className="h-14 w-14 object-contain"
            height={256}
            src="/brand/zss-logo.png"
            width={256}
          />
          <div>
            <p className="font-black">Znojemský šipkařský spolek</p>
            <p className="text-sm text-blue-200">Fotky, výsledky a dění ze znojemských šipek.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 text-sm font-bold text-blue-100">
          <Link href="/">Úvod</Link>
          <Link href="/tabulky">Tabulky</Link>
          <Link href="/turnaje">Turnaje</Link>
          <Link href="/galerie">Galerie</Link>
          <Link href="/prihlaseni">Přihlášení</Link>
        </div>
      </div>
    </footer>
  );
}

function formatDate(value: string | null) {
  if (!value) return "Bez data";
  return new Intl.DateTimeFormat("cs-CZ", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function fallbackGalleryHeaders(accessToken: string | null) {
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined;
}

async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function resizeToFullHd(file: File): Promise<PreparedPhoto> {
  const imageUrl = URL.createObjectURL(file);
  const image = new window.Image();
  image.src = imageUrl;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Fotku se nepodařilo načíst."));
  });

  const maximumWidth = 1920;
  const maximumHeight = 1080;
  const ratio = Math.min(maximumWidth / image.naturalWidth, maximumHeight / image.naturalHeight, 1);
  const width = Math.max(1, Math.round(image.naturalWidth * ratio));
  const height = Math.max(1, Math.round(image.naturalHeight * ratio));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    URL.revokeObjectURL(imageUrl);
    throw new Error("Prohlížeč nepodporuje zmenšení fotky.");
  }

  context.drawImage(image, 0, 0, width, height);
  URL.revokeObjectURL(imageUrl);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) resolve(result);
        else reject(new Error("Fotku se nepodařilo zmenšit."));
      },
      "image/jpeg",
      0.86,
    );
  });

  const resizedFile = new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
    type: "image/jpeg",
    lastModified: Date.now(),
  });

  return {
    file: resizedFile,
    previewUrl: URL.createObjectURL(resizedFile),
    width,
    height,
  };
}

export default function PublicGalleryPage() {
  const [albums, setAlbums] = useState<GalleryAlbum[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isPreparingPhotos, setIsPreparingPhotos] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [preparedPhotos, setPreparedPhotos] = useState<PreparedPhoto[]>([]);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [lightboxPhotoIndex, setLightboxPhotoIndex] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const photoCount = useMemo(() => albums.reduce((sum, album) => sum + album.photos.length, 0), [albums]);
  const featuredAlbum = albums.find((album) => album.photos.length > 0) ?? null;
  const selectedAlbum = useMemo(
    () => albums.find((album) => album.id === selectedAlbumId) ?? null,
    [albums, selectedAlbumId],
  );
  const lightboxPhoto = lightboxPhotoIndex !== null ? selectedAlbum?.photos[lightboxPhotoIndex] ?? null : null;

  async function loadGallery() {
    setIsLoading(true);
    setError(null);

    const token = await getAccessToken();
    const response = await fetch("/api/public/gallery", {
      headers: fallbackGalleryHeaders(token),
    });
    const body = (await response.json().catch(() => ({}))) as GalleryPayload;

    if (!response.ok) {
      setError(body.error ?? "Galerii se nepodařilo načíst.");
      setAlbums([]);
      setCurrentUser(body.currentUser ?? null);
      setIsLoading(false);
      return;
    }

    setAlbums(body.albums ?? []);
    setCurrentUser(body.currentUser ?? null);
    setIsLoading(false);
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadGallery();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
    // Intentionally run once after mount.
  }, []);

  useEffect(() => {
    return () => {
      preparedPhotos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
    };
  }, [preparedPhotos]);

  useEffect(() => {
    if (lightboxPhotoIndex === null || !selectedAlbum) {
      return;
    }

    const activeAlbum = selectedAlbum;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setLightboxPhotoIndex(null);
      }

      if (event.key === "ArrowLeft") {
        setLightboxPhotoIndex((current) => {
          if (current === null || activeAlbum.photos.length === 0) return current;
          return (current - 1 + activeAlbum.photos.length) % activeAlbum.photos.length;
        });
      }

      if (event.key === "ArrowRight") {
        setLightboxPhotoIndex((current) => {
          if (current === null || activeAlbum.photos.length === 0) return current;
          return (current + 1) % activeAlbum.photos.length;
        });
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxPhotoIndex, selectedAlbum]);

  async function handlePhotoSelection(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    preparedPhotos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
    setPreparedPhotos([]);
    setMessage(null);
    setError(null);

    if (files.length === 0) {
      return;
    }

    if (currentUser?.role !== "admin" && files.length > 100) {
      setError("Jedno album může obsahovat nejvýše 100 fotek.");
      event.target.value = "";
      return;
    }

    setIsPreparingPhotos(true);
    try {
      const resized = [];
      for (const file of files) {
        resized.push(await resizeToFullHd(file));
      }
      setPreparedPhotos(resized);
      setMessage(`Připraveno ${resized.length} fotek ve velikosti Full HD.`);
    } catch (resizeError) {
      setError(resizeError instanceof Error ? resizeError.message : "Fotky se nepodařilo připravit.");
    } finally {
      setIsPreparingPhotos(false);
      event.target.value = "";
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (preparedPhotos.length === 0) {
      setError("Vyberte alespoň jednu fotku.");
      return;
    }

    setIsSubmitting(true);
    const token = await getAccessToken();
    const formData = new FormData();
    formData.set("title", title);
    formData.set("description", description);
    formData.set("eventDate", eventDate);
    preparedPhotos.forEach((photo, index) => {
      formData.append("photos", photo.file);
      formData.set(`width_${index}`, `${photo.width}`);
      formData.set(`height_${index}`, `${photo.height}`);
    });

    const response = await fetch("/api/public/gallery", {
      body: formData,
      headers: fallbackGalleryHeaders(token),
      method: "POST",
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };

    if (!response.ok) {
      setError(body.error ?? "Album se nepodařilo nahrát.");
      setIsSubmitting(false);
      return;
    }

    preparedPhotos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
    setPreparedPhotos([]);
    setTitle("");
    setDescription("");
    setEventDate("");
    setIsUploadOpen(false);
    setMessage("Album bylo nahráno do galerie.");
    setIsSubmitting(false);
    await loadGallery();
  }

  async function deleteAlbum(albumId: string) {
    if (!window.confirm("Opravdu chcete smazat celé album?")) {
      return;
    }

    setError(null);
    setMessage(null);
    const token = await getAccessToken();
    const response = await fetch(`/api/public/gallery/${albumId}`, {
      headers: fallbackGalleryHeaders(token),
      method: "DELETE",
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };

    if (!response.ok) {
      setError(body.error ?? "Album se nepodařilo smazat.");
      return;
    }

    setAlbums((current) => current.filter((album) => album.id !== albumId));
    setSelectedAlbumId((current) => (current === albumId ? null : current));
    setLightboxPhotoIndex(null);
    setMessage("Album bylo smazáno.");
  }

  function openAlbum(albumId: string) {
    setSelectedAlbumId(albumId);
    setLightboxPhotoIndex(null);
  }

  function closeAlbum() {
    setSelectedAlbumId(null);
    setLightboxPhotoIndex(null);
  }

  function moveLightbox(direction: -1 | 1) {
    if (!selectedAlbum || selectedAlbum.photos.length === 0) {
      return;
    }

    setLightboxPhotoIndex((current) => {
      const currentIndex = current ?? 0;
      return (currentIndex + direction + selectedAlbum.photos.length) % selectedAlbum.photos.length;
    });
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#F4F8FF] text-[#0B1F3A]">
      <PublicHeader />

      <section className="relative isolate overflow-hidden bg-[#061A3A] text-white">
        <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_18%_18%,rgba(59,130,246,0.36),transparent_34%),radial-gradient(circle_at_86%_42%,rgba(239,35,60,0.25),transparent_30%),linear-gradient(135deg,#061A3A_0%,#0B2F6B_50%,#061A3A_100%)]" />
        <Image
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 top-8 -z-10 h-auto w-[520px] max-w-[72vw] opacity-[0.08]"
          height={900}
          src="/brand/zss-logo.png"
          width={700}
        />
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_0.9fr] lg:px-8 lg:py-16">
          <div>
            <p className="inline-flex rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-blue-100">
              Foto a video archiv
            </p>
            <h1 className="mt-7 text-5xl font-black tracking-tight sm:text-6xl">Galerie</h1>
            <p className="mt-5 max-w-2xl text-xl font-bold leading-8 text-blue-100">
              Alba ze zápasů, turnajů a klubových akcí Znojemského šipkařského spolku.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button
                className="rounded-full bg-[#EF233C] px-6 py-3 text-base font-black text-white shadow-xl shadow-red-950/25 transition hover:-translate-y-0.5 hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-55"
                disabled={!currentUser?.canUpload}
                onClick={() => setIsUploadOpen((current) => !current)}
                type="button"
              >
                Nahrát album
              </button>
            </div>
            <div className="mt-8 grid max-w-xl grid-cols-3 gap-3 sm:gap-5">
              {[
                ["Alb", isLoading ? "-" : albums.length],
                ["Fotografií", isLoading ? "-" : photoCount],
                ["Role", currentUser ? roleLabels[currentUser.role] : "host"],
              ].map(([label, value]) => (
                <div className="rounded-3xl border border-white/15 bg-white/10 p-4 backdrop-blur" key={label}>
                  <p className="text-2xl font-black sm:text-3xl">{value}</p>
                  <p className="mt-1 text-xs font-black uppercase tracking-[0.12em] text-blue-100">{label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-[#3B82F6]/20 blur-3xl" />
            <div className="relative overflow-hidden rounded-[32px] border border-white/15 bg-white/10 p-3 shadow-[0_30px_80px_rgba(0,0,0,0.28)] backdrop-blur">
              {featuredAlbum?.photos[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt={featuredAlbum.title}
                  className="aspect-[4/3] w-full rounded-[24px] object-cover"
                  src={featuredAlbum.photos[0].publicUrl}
                />
              ) : (
                <div className="flex aspect-[4/3] items-center justify-center rounded-[24px] bg-[radial-gradient(circle_at_30%_20%,rgba(239,35,60,0.35),transparent_30%),linear-gradient(135deg,#0B2F6B,#061A3A)]">
                  <Image
                    alt="Logo Znojemského šipkařského spolku"
                    className="h-auto w-48 opacity-80"
                    height={700}
                    src="/brand/zss-logo.png"
                    width={560}
                  />
                </div>
              )}
              <div className="px-2 py-4">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#3B82F6]">Poslední album</p>
                <h2 className="mt-1 text-2xl font-black">{featuredAlbum?.title ?? "Čekáme na první fotky"}</h2>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {!currentUser?.canUpload ? (
          <div className="rounded-[28px] border border-[#D8E4F2] bg-white px-5 py-4 text-sm font-bold text-slate-600 shadow-[0_20px_60px_rgba(6,26,58,0.08)]">
            Nepřihlášení uživatelé mohou galerii prohlížet. Nahrávání alb je dostupné po přihlášení pro hráče, kapitány, moderátory a administrátory.
          </div>
        ) : null}

        {message ? (
          <div className="mt-4 rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-black text-emerald-700">
            {message}
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-black text-red-700">
            {error}
          </div>
        ) : null}

        {isUploadOpen && currentUser?.canUpload ? (
          <section className="mt-6 rounded-[28px] border border-[#D8E4F2] bg-white p-5 shadow-[0_20px_60px_rgba(6,26,58,0.08)] sm:p-6">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#EF233C]">Nové album</p>
                <h2 className="mt-1 text-2xl font-black tracking-tight text-[#061A3A]">Nahrát fotky do galerie</h2>
                <p className="mt-2 max-w-3xl text-sm font-bold leading-6 text-slate-600">
                  Fotky se před odesláním automaticky zmenší na maximálně Full HD. Originály se do Supabase neposílají.
                </p>
              </div>
              <button
                className="rounded-full border border-[#D8E4F2] bg-[#F4F8FF] px-4 py-2 text-sm font-black text-[#061A3A] transition hover:-translate-y-0.5 hover:bg-blue-50"
                onClick={() => setIsUploadOpen(false)}
                type="button"
              >
                Zavřít
              </button>
            </div>

            <form className="grid gap-5" onSubmit={handleSubmit}>
              <div className="grid gap-4 lg:grid-cols-3">
                <label className="grid gap-2 text-sm font-black text-[#061A3A] lg:col-span-2">
                  Název alba
                  <input
                    className="min-h-12 rounded-2xl border border-[#D8E4F2] bg-white px-4 py-3 text-sm font-bold outline-none transition focus:border-[#0F4FA8] focus:ring-4 focus:ring-blue-100"
                    onChange={(event) => setTitle(event.target.value)}
                    required
                    value={title}
                  />
                </label>
                <label className="grid gap-2 text-sm font-black text-[#061A3A]">
                  Datum
                  <input
                    className="min-h-12 rounded-2xl border border-[#D8E4F2] bg-white px-4 py-3 text-sm font-bold outline-none transition focus:border-[#0F4FA8] focus:ring-4 focus:ring-blue-100"
                    onChange={(event) => setEventDate(event.target.value)}
                    required
                    type="date"
                    value={eventDate}
                  />
                </label>
              </div>

              <label className="grid gap-2 text-sm font-black text-[#061A3A]">
                Popis
                <textarea
                  className="min-h-28 rounded-2xl border border-[#D8E4F2] bg-white px-4 py-3 text-sm font-bold outline-none transition focus:border-[#0F4FA8] focus:ring-4 focus:ring-blue-100"
                  onChange={(event) => setDescription(event.target.value)}
                  value={description}
                />
              </label>

              <label className="grid gap-2 text-sm font-black text-[#061A3A]">
                Fotky
                <input
                  accept="image/jpeg,image/png,image/webp"
                  className="rounded-2xl border border-dashed border-[#9DB7D7] bg-[#F4F8FF] px-4 py-5 text-sm font-bold file:mr-4 file:rounded-full file:border-0 file:bg-[#0F4FA8] file:px-4 file:py-2 file:text-sm file:font-black file:text-white"
                  disabled={isPreparingPhotos || isSubmitting}
                  multiple
                  onChange={handlePhotoSelection}
                  type="file"
                />
              </label>

              {preparedPhotos.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {preparedPhotos.map((photo, index) => (
                    <div className="overflow-hidden rounded-3xl border border-[#D8E4F2] bg-[#F4F8FF]" key={photo.previewUrl}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img alt={`Připravená fotka ${index + 1}`} className="aspect-[4/3] w-full object-cover" src={photo.previewUrl} />
                      <p className="px-3 py-2 text-xs font-black text-slate-600">
                        {photo.width} × {photo.height}px
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="flex flex-col gap-3 rounded-3xl border border-[#D8E4F2] bg-[#F4F8FF] p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-bold text-slate-600">
                  {isPreparingPhotos ? "Připravuji fotky..." : "Album bude po nahrání veřejně dostupné v galerii."}
                </p>
                <button
                  className="rounded-full bg-[#EF233C] px-6 py-3 text-sm font-black text-white shadow-lg shadow-red-950/10 transition hover:-translate-y-0.5 hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isPreparingPhotos || isSubmitting}
                  type="submit"
                >
                  {isSubmitting ? "Nahrávám..." : "Uložit album"}
                </button>
              </div>
            </form>
          </section>
        ) : null}
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-14 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#EF233C]">
              {selectedAlbum ? "Album" : "Alba"}
            </p>
            <h2 className="mt-1 text-3xl font-black tracking-tight text-[#061A3A]">
              {selectedAlbum ? selectedAlbum.title : "Fotky z akcí"}
            </h2>
            {selectedAlbum ? (
              <p className="mt-2 max-w-3xl text-sm font-bold leading-6 text-slate-600">
                {selectedAlbum.description || `${selectedAlbum.photos.length} fotek / ${formatDate(selectedAlbum.eventDate)}`}
              </p>
            ) : null}
          </div>
          {selectedAlbum ? (
            <button
              className="rounded-full border border-[#D8E4F2] bg-white px-5 py-3 text-sm font-black text-[#061A3A] shadow-sm transition hover:-translate-y-0.5 hover:bg-blue-50"
              onClick={closeAlbum}
              type="button"
            >
              Zpět na alba
            </button>
          ) : null}
        </div>

        {isLoading ? (
          <div className="rounded-[28px] border border-[#D8E4F2] bg-white px-6 py-8 text-sm font-bold text-slate-500 shadow-[0_20px_60px_rgba(6,26,58,0.08)]">
            Načítám galerii...
          </div>
        ) : null}

        {!isLoading && albums.length === 0 ? (
          <div className="rounded-[28px] border border-[#D8E4F2] bg-white px-6 py-8 text-sm font-bold text-slate-500 shadow-[0_20px_60px_rgba(6,26,58,0.08)]">
            Galerie zatím neobsahuje žádná alba.
          </div>
        ) : null}

        {!selectedAlbum ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {albums.map((album) => {
              const coverPhoto = album.photos[0] ?? null;
              return (
                <article
                  className="group overflow-hidden rounded-[28px] border border-[#D8E4F2] bg-white shadow-[0_20px_60px_rgba(6,26,58,0.08)] transition hover:-translate-y-1 hover:shadow-[0_26px_70px_rgba(6,26,58,0.14)]"
                  key={album.id}
                >
                  <button className="block w-full text-left" onClick={() => openAlbum(album.id)} type="button">
                    <div className="relative aspect-[4/3] overflow-hidden bg-[#061A3A]">
                      {coverPhoto ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          alt={album.title}
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                          loading="lazy"
                          src={coverPhoto.publicUrl}
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_30%_20%,rgba(239,35,60,0.35),transparent_30%),linear-gradient(135deg,#0B2F6B,#061A3A)]">
                          <Image
                            alt="Logo Znojemského šipkařského spolku"
                            className="h-auto w-32 opacity-80"
                            height={700}
                            src="/brand/zss-logo.png"
                            width={560}
                          />
                        </div>
                      )}
                      <span className="absolute bottom-4 left-4 rounded-full bg-white px-4 py-2 text-sm font-black text-[#061A3A] shadow-lg">
                        {album.photos.length} fotek
                      </span>
                    </div>
                    <div className="p-5">
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#EF233C]">{formatDate(album.eventDate)}</p>
                      <h3 className="mt-2 text-2xl font-black tracking-tight text-[#061A3A]">{album.title}</h3>
                      {album.description ? <p className="mt-2 line-clamp-2 text-sm font-bold leading-6 text-slate-600">{album.description}</p> : null}
                    </div>
                  </button>
                  {currentUser?.canDelete ? (
                    <div className="border-t border-[#D8E4F2] px-5 py-4">
                      <button
                        className="rounded-full bg-[#EF233C] px-4 py-2 text-sm font-black text-white shadow-lg shadow-red-950/10 transition hover:-translate-y-0.5 hover:bg-red-500"
                        onClick={() => void deleteAlbum(album.id)}
                        type="button"
                      >
                        Smazat album
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : selectedAlbum.photos.length === 0 ? (
          <div className="rounded-[28px] border border-[#D8E4F2] bg-white px-6 py-8 text-sm font-bold text-slate-500 shadow-[0_20px_60px_rgba(6,26,58,0.08)]">
            Album zatím neobsahuje žádné fotky.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {selectedAlbum.photos.map((photo, index) => (
              <button
                className="group block overflow-hidden rounded-3xl bg-[#F4F8FF] text-left shadow-[0_14px_38px_rgba(6,26,58,0.08)]"
                key={photo.id}
                onClick={() => setLightboxPhotoIndex(index)}
                type="button"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt={`${selectedAlbum.title} - fotka ${index + 1}`}
                  className="aspect-[4/3] w-full object-cover transition duration-300 group-hover:scale-105"
                  loading="lazy"
                  src={photo.publicUrl}
                />
              </button>
            ))}
          </div>
        )}
      </section>

      {selectedAlbum && lightboxPhoto ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#061A3A]/95 p-4 text-white"
          role="dialog"
          aria-modal="true"
          aria-label={`Fotka ${lightboxPhotoIndex! + 1} z alba ${selectedAlbum.title}`}
        >
          <button
            className="absolute right-4 top-4 rounded-full bg-white px-4 py-2 text-sm font-black text-[#061A3A] shadow-lg transition hover:-translate-y-0.5 hover:bg-blue-50"
            onClick={() => setLightboxPhotoIndex(null)}
            type="button"
          >
            Zavřít
          </button>

          <button
            className="absolute left-3 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-3xl font-black backdrop-blur transition hover:bg-white hover:text-[#061A3A] sm:left-6 sm:h-14 sm:w-14"
            onClick={() => moveLightbox(-1)}
            type="button"
            aria-label="Předchozí fotka"
          >
            ‹
          </button>

          <div className="flex max-h-[86vh] max-w-6xl flex-col items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={`${selectedAlbum.title} - fotka ${lightboxPhotoIndex! + 1}`}
              className="max-h-[78vh] max-w-full rounded-3xl object-contain shadow-[0_30px_90px_rgba(0,0,0,0.45)]"
              src={lightboxPhoto.publicUrl}
            />
            <p className="rounded-full bg-white/10 px-4 py-2 text-sm font-black text-blue-100 backdrop-blur">
              {selectedAlbum.title} / {lightboxPhotoIndex! + 1} z {selectedAlbum.photos.length}
            </p>
          </div>

          <button
            className="absolute right-3 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-3xl font-black backdrop-blur transition hover:bg-white hover:text-[#061A3A] sm:right-6 sm:h-14 sm:w-14"
            onClick={() => moveLightbox(1)}
            type="button"
            aria-label="Další fotka"
          >
            ›
          </button>
        </div>
      ) : null}

      <PublicFooter />
    </main>
  );
}

