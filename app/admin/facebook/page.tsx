"use client";

import { adminFetch } from "@/lib/adminFetch";
import { Button, Card, PageHeader } from "@/components/ui/admin";
import { useEffect, useMemo, useState } from "react";

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

type Team = {
  teamSeasonId: string;
  name: string;
  logoUrl: string | null;
};

type RoundMatch = {
  id: string;
  roundNumber: number;
  scheduledAt: string;
  homeTeam: Team;
  awayTeam: Team;
};

type UpcomingRoundPayload = {
  selections: {
    seasonId: string;
    leagueId: string;
    groupId: string;
    roundNumber: number | null;
  };
  seasons: Season[];
  leagues: League[];
  groups: Group[];
  rounds: number[];
  matches: RoundMatch[];
  byes: Team[];
  caption: string;
  selectedSeason: Season | null;
  selectedLeague: League | null;
  selectedGroup: Group | null;
  error?: string;
};

type PublishResponse = {
  success?: boolean;
  id?: string | null;
  post_id?: string | null;
  error?: string;
};

type Selections = {
  seasonId: string;
  leagueId: string;
  groupId: string;
  roundNumber: string;
};

const emptySelections: Selections = {
  seasonId: "",
  leagueId: "",
  groupId: "",
  roundNumber: "",
};

const selectClass =
  "rounded-2xl border border-[var(--admin-border)] bg-white px-4 py-3 text-sm font-bold text-[var(--brand-navy)] outline-none focus:border-[var(--brand-blue)]";

function queryFromSelections(selections: Selections) {
  const params = new URLSearchParams();
  if (selections.seasonId) params.set("season_id", selections.seasonId);
  if (selections.leagueId) params.set("league_id", selections.leagueId);
  if (selections.groupId) params.set("group_id", selections.groupId);
  if (selections.roundNumber) params.set("round_number", selections.roundNumber);
  return params;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("cs-CZ", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

async function readJson(response: Response) {
  return (await response.json().catch(() => ({}))) as UpcomingRoundPayload;
}

async function readPublishJson(response: Response) {
  return (await response.json().catch(() => ({}))) as PublishResponse;
}

export default function AdminFacebookPage() {
  const [payload, setPayload] = useState<UpcomingRoundPayload | null>(null);
  const [selections, setSelections] = useState<Selections>(emptySelections);
  const [caption, setCaption] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
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
  const groupOptions = useMemo(
    () => (payload?.groups ?? []).filter((group) => group.leagueId === selections.leagueId),
    [payload?.groups, selections.leagueId],
  );

  async function loadPreview(nextSelections: Selections, replaceCaption = true) {
    setIsLoading(true);
    setIsImageLoading(true);
    setError(null);
    setPublishMessage(null);
    setPublishTechnicalInfo(null);

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
        groupId: body.selections.groupId,
        roundNumber: body.selections.roundNumber ? String(body.selections.roundNumber) : "",
      };
      setPayload(body);
      setSelections(resolvedSelections);

      if (replaceCaption) {
        setCaption(body.caption);
      }

      const imageQuery = queryFromSelections(resolvedSelections);
      const imageResponse = await adminFetch(
        `/api/admin/facebook/upcoming-round-image?${imageQuery.toString()}`,
        { cache: "no-store" },
      );

      if (!imageResponse.ok) {
        throw new Error("Facebook grafiku se nepodařilo vytvořit.");
      }

      const blob = await imageResponse.blob();
      const nextImageUrl = URL.createObjectURL(blob);
      setImageUrl((currentUrl) => {
        if (currentUrl) URL.revokeObjectURL(currentUrl);
        return nextImageUrl;
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
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  function handleSelectionChange(field: keyof Selections, value: string) {
    const nextSelections = {
      ...selections,
      [field]: value,
      ...(field === "seasonId" ? { leagueId: "", groupId: "", roundNumber: "" } : {}),
      ...(field === "leagueId" ? { groupId: "", roundNumber: "" } : {}),
      ...(field === "groupId" ? { roundNumber: "" } : {}),
    };

    setSelections(nextSelections);
    void loadPreview(nextSelections);
  }

  const canPublish =
    Boolean(selections.seasonId) &&
    Boolean(selections.leagueId) &&
    Boolean(selections.groupId) &&
    Boolean(selections.roundNumber) &&
    Boolean(imageUrl) &&
    caption.trim().length > 0 &&
    !isLoading &&
    !isImageLoading &&
    !isPublishing;

  async function handlePublish() {
    if (!canPublish) {
      return;
    }

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
          groupId: selections.groupId,
          roundNumber: selections.roundNumber,
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
        body.id ? `photo id: ${body.id}` : null,
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

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        description="Připravte grafiku a text pro příspěvek na facebookovou stránku spolku."
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
            Soutěž / liga
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
            Skupina
            <select
              className={selectClass}
              disabled={isLoading || !selections.leagueId}
              onChange={(event) => handleSelectionChange("groupId", event.target.value)}
              value={selections.groupId}
            >
              <option value="">Vyberte skupinu</option>
              {groupOptions.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm font-black text-[var(--brand-navy)]">
            Kolo
            <select
              className={selectClass}
              disabled={isLoading || !selections.groupId || (payload?.rounds ?? []).length === 0}
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

      <div className="grid gap-8 xl:grid-cols-[minmax(340px,520px)_1fr]">
        <Card>
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-lg font-black text-[var(--brand-navy)]">Grafika</h3>
            <span className="rounded-full bg-[#F4F8FF] px-3 py-1 text-xs font-black text-[var(--brand-blue)]">
              1080 × 1080 px
            </span>
          </div>

          <div className="mt-5 overflow-hidden rounded-2xl border border-[var(--admin-border)] bg-[#F4F8FF]">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt="Náhled grafiky pro Facebook"
                className="aspect-square w-full object-contain"
                src={imageUrl}
              />
            ) : (
              <div className="flex aspect-square w-full items-center justify-center p-6 text-center text-sm font-bold text-[var(--admin-muted)]">
                {isImageLoading ? "Generuji grafiku..." : "Vyberte kolo pro náhled grafiky."}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <h3 className="text-lg font-black text-[var(--brand-navy)]">Text příspěvku</h3>
          <textarea
            className="mt-5 min-h-[340px] w-full resize-y rounded-2xl border border-[var(--admin-border)] bg-white px-4 py-3 text-sm leading-6 text-[var(--brand-navy)] outline-none focus:border-[var(--brand-blue)]"
            onChange={(event) => setCaption(event.target.value)}
            value={caption}
          />

          <div className="mt-6 rounded-2xl border border-[var(--admin-border)] bg-[#F4F8FF] p-4">
            <h4 className="text-sm font-black text-[var(--brand-navy)]">Zápasy v náhledu</h4>
            {payload?.matches.length ? (
              <div className="mt-3 grid gap-2">
                {payload.matches.map((match) => (
                  <div
                    className="rounded-xl bg-white px-4 py-3 text-sm font-bold text-[var(--brand-navy)]"
                    key={match.id}
                  >
                    <span className="text-[var(--admin-muted)]">
                      {formatDateTime(match.scheduledAt)}
                    </span>
                    <span className="mx-2 text-[var(--brand-coral)]">•</span>
                    {match.homeTeam.name} vs. {match.awayTeam.name}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm font-semibold text-[var(--admin-muted)]">
                Pro vybrané kolo nejsou zadané zápasy.
              </p>
            )}

            {payload?.byes.length ? (
              <p className="mt-3 text-sm font-black text-[var(--brand-navy)]">
                Volno: {payload.byes.map((team) => team.name).join(", ")}
              </p>
            ) : null}
          </div>
        </Card>
      </div>

      {isPublishDialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-black text-[var(--brand-navy)]">
              Publikovat na Facebook
            </h3>
            <p className="mt-3 text-sm font-semibold text-[var(--admin-muted)]">
              Opravdu chcete zveřejnit tento příspěvek na Facebooku?
            </p>
            <div className="mt-5 rounded-2xl bg-[#F4F8FF] p-4 text-sm font-bold text-[var(--brand-navy)]">
              <p>Sezóna: {payload?.selectedSeason?.name ?? "-"}</p>
              <p>Liga: {payload?.selectedLeague?.name ?? "-"}</p>
              <p>Skupina: {payload?.selectedGroup?.name ?? "-"}</p>
              <p>Kolo: {selections.roundNumber ? `${selections.roundNumber}. kolo` : "-"}</p>
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
    </div>
  );
}
