"use client";

import { adminFetch } from "@/lib/adminFetch";
import { Button, Card, PageHeader } from "@/components/ui/admin";
import { useEffect, useMemo, useState } from "react";

type PostType = "upcoming" | "results";
type ImageKind = "upcoming_schedule" | "results" | "standings";

type Season = {
  id: string;
  name: string;
  isActive: boolean;
};

type League = {
  id: string;
  seasonId: string;
  name: string;
};

type Group = {
  id: string;
  leagueId: string;
  name: string;
};

type RoundImage = {
  id: string;
  kind: ImageKind;
  groupId: string;
  groupName: string;
  label: string;
};

type GroupRound = {
  group: Group;
  matches: unknown[];
  byes: unknown[];
  standings: unknown[];
};

type FacebookPayload = {
  selections: {
    seasonId: string;
    leagueId: string;
    roundNumber: number | null;
    postType: PostType;
  };
  seasons: Season[];
  leagues: League[];
  groups: Group[];
  selectedGroups: GroupRound[];
  rounds: number[];
  images: RoundImage[];
  caption: string;
  selectedSeason: Season | null;
  selectedLeague: League | null;
  error?: string;
};

type PublishResponse = {
  success?: boolean;
  id?: string | null;
  post_id?: string | null;
  photo_ids?: string[];
  error?: string;
};

type Selections = {
  seasonId: string;
  leagueId: string;
  roundNumber: string;
  postType: PostType;
};

type PreviewImage = RoundImage & {
  url: string;
};

const emptySelections: Selections = {
  seasonId: "",
  leagueId: "",
  roundNumber: "",
  postType: "upcoming",
};

const selectClass =
  "rounded-2xl border border-[var(--admin-border)] bg-white px-4 py-3 text-sm font-bold text-[var(--brand-navy)] outline-none focus:border-[var(--brand-blue)]";

function queryFromSelections(selections: Selections) {
  const params = new URLSearchParams();
  if (selections.seasonId) params.set("season_id", selections.seasonId);
  if (selections.leagueId) params.set("league_id", selections.leagueId);
  if (selections.roundNumber) params.set("round_number", selections.roundNumber);
  params.set("post_type", selections.postType);
  return params;
}

async function readJson(response: Response) {
  return (await response.json().catch(() => ({}))) as FacebookPayload;
}

async function readPublishJson(response: Response) {
  return (await response.json().catch(() => ({}))) as PublishResponse;
}

function imageKindLabel(kind: ImageKind) {
  if (kind === "results") return "Výsledky";
  if (kind === "standings") return "Tabulka";
  return "Rozpis";
}

export default function AdminFacebookPage() {
  const [payload, setPayload] = useState<FacebookPayload | null>(null);
  const [selections, setSelections] = useState<Selections>(emptySelections);
  const [caption, setCaption] = useState("");
  const [imageUrls, setImageUrls] = useState<PreviewImage[]>([]);
  const [selectedPreviewImage, setSelectedPreviewImage] = useState<PreviewImage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishMessage, setPublishMessage] = useState<string | null>(null);
  const [publishTechnicalInfo, setPublishTechnicalInfo] = useState<string | null>(null);

  const leagueOptions = useMemo(
    () => (payload?.leagues ?? []).filter((league) => league.seasonId === selections.seasonId),
    [payload?.leagues, selections.seasonId],
  );

  async function loadPreview(nextSelections: Selections, replaceCaption = true) {
    setIsLoading(true);
    setIsImageLoading(true);
    setError(null);
    setPublishMessage(null);
    setPublishTechnicalInfo(null);
    setSelectedPreviewImage(null);

    try {
      const query = queryFromSelections(nextSelections);
      const response = await adminFetch(`/api/admin/facebook/upcoming-round?${query.toString()}`, {
        cache: "no-store",
      });
      const body = await readJson(response);

      if (!response.ok) {
        throw new Error(body.error ?? "Facebook náhled se nepodařilo načíst.");
      }

      const resolvedSelections = {
        seasonId: body.selections.seasonId,
        leagueId: body.selections.leagueId,
        roundNumber: body.selections.roundNumber ? String(body.selections.roundNumber) : "",
        postType: body.selections.postType,
      };
      setPayload(body);
      setSelections(resolvedSelections);

      if (replaceCaption) {
        setCaption(body.caption);
      }

      const previews = await Promise.all(
        body.images.map(async (image) => {
          const imageQuery = queryFromSelections(resolvedSelections);
          imageQuery.set("group_id", image.groupId);
          imageQuery.set("image_kind", image.kind);
          const imageResponse = await adminFetch(
            `/api/admin/facebook/upcoming-round-image?${imageQuery.toString()}`,
            { cache: "no-store" },
          );

          if (!imageResponse.ok) {
            throw new Error("Facebook grafiku se nepodařilo vytvořit.");
          }

          return {
            ...image,
            url: URL.createObjectURL(await imageResponse.blob()),
          };
        }),
      );

      setImageUrls((currentUrls) => {
        currentUrls.forEach((image) => URL.revokeObjectURL(image.url));
        return previews;
      });
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Facebook náhled se nepodařilo načíst.",
      );
    }

    setIsLoading(false);
    setIsImageLoading(false);
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadPreview(emptySelections), 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    return () => {
      imageUrls.forEach((image) => URL.revokeObjectURL(image.url));
    };
  }, [imageUrls]);

  function handleSelectionChange(field: keyof Selections, value: string) {
    const nextSelections = {
      ...selections,
      [field]: value,
      ...(field === "seasonId" ? { leagueId: "", roundNumber: "" } : {}),
      ...(field === "leagueId" ? { roundNumber: "" } : {}),
    } as Selections;

    setSelections(nextSelections);
    void loadPreview(nextSelections);
  }

  const canPublish =
    Boolean(selections.seasonId) &&
    Boolean(selections.leagueId) &&
    Boolean(selections.roundNumber) &&
    imageUrls.length > 0 &&
    caption.trim().length > 0 &&
    !isLoading &&
    !isImageLoading &&
    !isPublishing;

  async function handlePublish() {
    if (!canPublish) return;

    setIsPublishing(true);
    setError(null);
    setPublishMessage(null);
    setPublishTechnicalInfo(null);

    try {
      const response = await adminFetch("/api/admin/facebook/publish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          seasonId: selections.seasonId,
          leagueId: selections.leagueId,
          roundNumber: selections.roundNumber,
          postType: selections.postType,
          message: caption,
        }),
      });
      const body = await readPublishJson(response);

      if (!response.ok) {
        throw new Error(body.error ?? "Příspěvek se nepodařilo zveřejnit na Facebooku.");
      }

      setIsPublishDialogOpen(false);
      setPublishMessage("Příspěvek byl úspěšně zveřejněn na Facebooku.");
      const technicalInfo = [
        body.post_id ? `post_id: ${body.post_id}` : null,
        body.id ? `id: ${body.id}` : null,
        body.photo_ids?.length ? `photo ids: ${body.photo_ids.join(", ")}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      setPublishTechnicalInfo(technicalInfo || null);
    } catch (publishError) {
      setError(
        publishError instanceof Error
          ? publishError.message
          : "Příspěvek se nepodařilo zveřejnit na Facebooku.",
      );
    }

    setIsPublishing(false);
  }

  const groupedImages = (payload?.selectedGroups ?? []).map((groupRound) => ({
    group: groupRound.group,
    images: imageUrls.filter((image) => image.groupId === groupRound.group.id),
  }));

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        description="Připravte souhrnný facebookový příspěvek pro celé ligové kolo."
        title="Facebook"
      />

      {error ? (
        <Card>
          <p className="text-sm font-semibold text-red-700">{error}</p>
        </Card>
      ) : null}

      <Card>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="grid gap-2 text-sm font-black text-[var(--brand-navy)]">
            Sezóna
            <select
              className={selectClass}
              disabled={isLoading}
              onChange={(event) => handleSelectionChange("seasonId", event.target.value)}
              value={selections.seasonId}
            >
              <option value="">Vyberte sezónu</option>
              {(payload?.seasons ?? []).map((season) => (
                <option key={season.id} value={season.id}>
                  {season.name}
                  {season.isActive ? " - aktivní" : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm font-black text-[var(--brand-navy)]">
            Liga
            <select
              className={selectClass}
              disabled={isLoading || !selections.seasonId}
              onChange={(event) => handleSelectionChange("leagueId", event.target.value)}
              value={selections.leagueId}
            >
              <option value="">Vyberte ligu</option>
              {leagueOptions.map((league) => (
                <option key={league.id} value={league.id}>
                  {league.name}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm font-black text-[var(--brand-navy)]">
            Kolo
            <select
              className={selectClass}
              disabled={isLoading || !selections.leagueId || (payload?.rounds ?? []).length === 0}
              onChange={(event) => handleSelectionChange("roundNumber", event.target.value)}
              value={selections.roundNumber}
            >
              <option value="">Vyberte kolo</option>
              {(payload?.rounds ?? []).map((roundNumber) => (
                <option key={roundNumber} value={roundNumber}>
                  {roundNumber}. kolo
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-2 text-sm font-black text-[var(--brand-navy)]">
            <span>Typ příspěvku</span>
            <div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-[var(--admin-border)] bg-white p-1">
              {[
                { label: "Nadcházející kolo", value: "upcoming" as const },
                { label: "Výsledky kola", value: "results" as const },
              ].map((option) => {
                const isSelected = selections.postType === option.value;

                return (
                  <button
                    aria-pressed={isSelected}
                    className={`rounded-xl px-3 py-2.5 text-sm font-black transition ${
                      isSelected
                        ? "bg-[var(--brand-blue)] text-white shadow-sm"
                        : "text-[var(--brand-navy)] hover:bg-[#F4F8FF]"
                    }`}
                    disabled={isLoading}
                    key={option.value}
                    onClick={() => handleSelectionChange("postType", option.value)}
                    type="button"
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <Button
            disabled={isLoading}
            isLoading={isLoading || isImageLoading}
            onClick={() => void loadPreview(selections)}
            type="button"
          >
            Obnovit náhled
          </Button>
          <Button
            disabled={!canPublish}
            isLoading={isPublishing}
            onClick={() => setIsPublishDialogOpen(true)}
            type="button"
            variant="secondary"
          >
            {isPublishing ? "Publikuji..." : "Publikovat na Facebook"}
          </Button>
        </div>

        {publishMessage ? (
          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-black text-emerald-800">{publishMessage}</p>
            {publishTechnicalInfo ? (
              <p className="mt-2 text-xs font-semibold text-emerald-700">
                {publishTechnicalInfo}
              </p>
            ) : null}
          </div>
        ) : null}
      </Card>

      <div className="grid gap-8 xl:grid-cols-[minmax(360px,1fr)_520px]">
        <Card>
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-lg font-black text-[var(--brand-navy)]">Grafiky</h3>
            <span className="rounded-full bg-[#F4F8FF] px-3 py-1 text-xs font-black text-[var(--brand-blue)]">
              {imageUrls.length} × 1080 × 1080 px
            </span>
          </div>

          <div className="mt-5 grid gap-6">
            {groupedImages.length > 0 ? (
              groupedImages.map(({ group, images }) => (
                <section key={group.id}>
                  <h4 className="text-sm font-black text-[var(--brand-navy)]">{group.name}</h4>
                  <div className="mt-3 grid gap-4 md:grid-cols-2">
                    {images.map((image) => (
                      <button
                        aria-label={`Zobrazit grafiku ${image.label} v plné velikosti`}
                        className="overflow-hidden rounded-2xl border border-[var(--admin-border)] bg-[#F4F8FF]"
                        key={image.id}
                        onClick={() => setSelectedPreviewImage(image)}
                        type="button"
                      >
                        <div className="flex items-center justify-between px-3 py-2 text-xs font-black text-[var(--brand-blue)]">
                          <span>{imageKindLabel(image.kind)}</span>
                          <span>{image.groupName}</span>
                        </div>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          alt={image.label}
                          className="aspect-square w-full object-contain"
                          src={image.url}
                        />
                      </button>
                    ))}
                  </div>
                </section>
              ))
            ) : (
              <div className="flex min-h-[260px] items-center justify-center rounded-2xl border border-[var(--admin-border)] bg-[#F4F8FF] p-6 text-center text-sm font-bold text-[var(--admin-muted)]">
                {isImageLoading ? "Generuji grafiky..." : "Vyberte kolo pro náhled grafik."}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <h3 className="text-lg font-black text-[var(--brand-navy)]">Text příspěvku</h3>
          <textarea
            className="mt-5 min-h-[360px] w-full resize-y rounded-2xl border border-[var(--admin-border)] bg-white px-4 py-3 text-sm leading-6 text-[var(--brand-navy)] outline-none focus:border-[var(--brand-blue)]"
            onChange={(event) => setCaption(event.target.value)}
            value={caption}
          />
        </Card>
      </div>

      {isPublishDialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-black text-[var(--brand-navy)]">
              Publikovat na Facebook?
            </h3>
            <div className="mt-5 rounded-2xl bg-[#F4F8FF] p-4 text-sm font-bold text-[var(--brand-navy)]">
              <p>Kolo: {selections.roundNumber ? `${selections.roundNumber}. kolo` : "-"}</p>
              <p>Sezóna: {payload?.selectedSeason?.name ?? "-"}</p>
              <p>Liga: {payload?.selectedLeague?.name ?? "-"}</p>
              <p>Typ: {selections.postType === "results" ? "Výsledky kola" : "Nadcházející kolo"}</p>
              <p>Počet obrázků: {imageUrls.length}</p>
              <p>Skupiny: {(payload?.selectedGroups ?? []).map((item) => item.group.name).join(", ") || "-"}</p>
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <Button
                disabled={isPublishing}
                onClick={() => setIsPublishDialogOpen(false)}
                type="button"
                variant="secondary"
              >
                Zrušit
              </Button>
              <Button
                disabled={!canPublish}
                isLoading={isPublishing}
                onClick={() => void handlePublish()}
                type="button"
              >
                {isPublishing ? "Publikuji..." : "Publikovat"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedPreviewImage ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/75 p-4"
          onClick={() => setSelectedPreviewImage(null)}
        >
          <div
            className="flex max-h-[calc(100vh-2rem)] w-full max-w-[calc(100vh-2rem)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4 border-b border-[var(--admin-border)] px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-black text-[var(--brand-navy)]">
                  {selectedPreviewImage.groupName}
                </p>
                <p className="text-xs font-bold text-[var(--admin-muted)]">
                  {imageKindLabel(selectedPreviewImage.kind)} · 1080 × 1080 px
                </p>
              </div>
              <button
                aria-label="Zavřít náhled"
                className="shrink-0 rounded-full border border-[var(--admin-border)] px-4 py-2 text-sm font-black text-[var(--brand-navy)] hover:bg-[#F4F8FF]"
                onClick={() => setSelectedPreviewImage(null)}
                type="button"
              >
                Zavřít
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={selectedPreviewImage.label}
              className="aspect-square h-auto max-h-[calc(100vh-7rem)] w-full object-contain"
              src={selectedPreviewImage.url}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
