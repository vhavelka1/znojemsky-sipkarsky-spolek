"use client";

import Image from "next/image";
import Link from "next/link";
import { PublicHeader as SharedPublicHeader } from "@/components/public/PublicShell";
import { supabase } from "@/lib/supabase";
import { FormEvent, useEffect, useMemo, useState } from "react";

type TournamentType = "major" | "mini";
type TournamentStatus = "preparing" | "registration_open" | "played" | "pending_approval";

type TournamentPreview = {
  id: string;
  name: string;
  type: TournamentType;
  date: string;
  place: string;
  format: string;
  capacity?: number | string;
  freeSlots?: number | string;
  presentation?: string;
  startTime?: string;
  entryFee?: string;
  posterDataUrl?: string;
  status: TournamentStatus;
  parts?: Array<{
    id: string;
    category: string;
    is_doubles?: boolean;
    presentation: string;
    start_time: string;
    format: string;
    entry_fee: string;
    comment: string;
  }>;
};

type MiniTournamentRequest = {
  organizerTeamSeasonId: string;
  name: string;
  date: string;
  place: string;
  capacity: string;
  freeSlots: string;
  posterDataUrl: string;
  parts: TournamentRequestPartForm[];
};

type TournamentRequestPartForm = {
  id: string;
  category: string;
  isDoubles: boolean;
  presentation: string;
  startTime: string;
  format: string;
  entryFee: string;
  comment: string;
};

type OrganizerOption = {
  teamSeasonId: string;
  teamId: string;
  name: string;
  seasonName: string;
};


const tournaments: TournamentPreview[] = [
  {
    id: "znojemsky-open-2026",
    name: "Znojemský Open 2026",
    type: "major",
    date: "14. 6. 2026",
    place: "Znojmo",
    format: "501 DO",
    capacity: 64,
    status: "preparing",
  },
  {
    id: "major-letni-pohar-2026",
    name: "Letní major pohár",
    type: "major",
    date: "12. 7. 2026",
    place: "Znojmo",
    format: "501 DO",
    capacity: 64,
    status: "preparing",
  },
  {
    id: "kohouti-mackovice-mini-501-dido",
    name: "Kohouti Mackovice hlásí miniturnaj v 501 DIDO",
    type: "mini",
    date: "6. 6. 2026",
    place: "Hospoda u Kohouta Mackovice",
    format: "501 DIDO",
    capacity: 24,
    freeSlots: 18,
    presentation: "16:30-16:45",
    startTime: "17:00",
    entryFee: "150 Kč (+30 Kč poplatek za terče)",
    status: "pending_approval",
  },
  {
    id: "letni-mini-dvojic-2026",
    name: "Letní mini turnaj dvojic",
    type: "mini",
    date: "21. 6. 2026",
    place: "Znojmo",
    format: "501 DO",
    capacity: 32,
    freeSlots: 32,
    presentation: "16:00-16:30",
    startTime: "17:00",
    entryFee: "150 Kč",
    status: "preparing",
  },
];

const emptyRequest: MiniTournamentRequest = {
  organizerTeamSeasonId: "",
  name: "",
  date: "",
  place: "",
  capacity: "",
  freeSlots: "",
  posterDataUrl: "",
  parts: [
    {
      id: "initial",
      category: "",
      isDoubles: false,
      presentation: "",
      startTime: "",
      format: "",
      entryFee: "",
      comment: "",
    },
  ],
};

function emptyPart(): TournamentRequestPartForm {
  return {
    id: crypto.randomUUID(),
    category: "",
    isDoubles: false,
    presentation: "",
    startTime: "",
    format: "",
    entryFee: "",
    comment: "",
  };
}

const statusLabels: Record<TournamentStatus, string> = {
  preparing: "připravuje se",
  registration_open: "otevřená registrace",
  played: "odehráno",
  pending_approval: "čeká na schválení",
};

const statusClasses: Record<TournamentStatus, string> = {
  preparing: "bg-blue-50 text-[#0F4FA8] border-[#D8E4F2]",
  registration_open: "bg-red-50 text-[#EF233C] border-red-100",
  played: "bg-slate-100 text-slate-600 border-slate-200",
  pending_approval: "bg-amber-50 text-amber-700 border-amber-200",
};

const tabCopy: Record<TournamentType, { title: string; description: string }> = {
  major: {
    title: "Major turnaje",
    description: "Větší bodované turnaje spolku. Výsledky se vyhodnocují zvlášť za jednotlivé turnaje i za celou sezónu.",
  },
  mini: {
    title: "Mini turnaje",
    description: "Klubové miniturnaje pořádané kapitány nebo zástupci týmů. Žádosti schvalují moderátoři nebo administrátoři.",
  },
};

function PublicHeader() {
  return <SharedPublicHeader activeHref="/turnaje" />;
}

function TournamentCard({ tournament }: { tournament: TournamentPreview }) {
  return (
    <article className="group flex h-full flex-col rounded-[28px] border border-[#D8E4F2] bg-white p-5 shadow-[0_20px_60px_rgba(6,26,58,0.08)] transition hover:-translate-y-1 hover:shadow-[0_24px_70px_rgba(6,26,58,0.12)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="rounded-full bg-[#F4F8FF] px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-[#0F4FA8]">
          {tournament.type === "major" ? "Major turnaj" : "Mini turnaj"}
        </span>
        <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusClasses[tournament.status]}`}>
          {statusLabels[tournament.status]}
        </span>
      </div>
      <h3 className="mt-5 text-2xl font-black tracking-tight text-[#061A3A]">{tournament.name}</h3>
      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        <InfoItem label="Datum" value={tournament.date} />
        <InfoItem label="Místo" value={tournament.place} />
        {tournament.format ? <InfoItem label="Formát" value={tournament.format} /> : null}
        {tournament.capacity ? <InfoItem label="Počet míst" value={`${tournament.capacity}`} /> : null}
        {tournament.freeSlots !== undefined ? <InfoItem label="Volných" value={`${tournament.freeSlots}`} /> : null}
        {tournament.presentation ? <InfoItem label="Prezence" value={tournament.presentation} /> : null}
        {tournament.startTime ? <InfoItem label="Začátek" value={tournament.startTime} /> : null}
        {tournament.entryFee ? <InfoItem label="Startovné" value={tournament.entryFee} wide /> : null}
      </dl>
      {tournament.parts && tournament.parts.length > 0 ? (
        <div className="mt-4 grid gap-2">
          {tournament.parts.map((part) => (
            <div className="rounded-2xl border border-[#D8E4F2] bg-[#F8FBFF] px-4 py-3 text-sm" key={part.id}>
              <p className="font-black text-[#061A3A]">{part.category}</p>
              {part.is_doubles ? <p className="mt-1 text-xs font-black uppercase tracking-[0.12em] text-[#0F4FA8]">Dvojice</p> : null}
              <p className="mt-1 font-bold text-slate-600">
                Prezence {part.presentation} / start {part.start_time} / {part.format} / {part.entry_fee}
              </p>
              {part.comment ? <p className="mt-2 text-slate-600">{part.comment}</p> : null}
            </div>
          ))}
        </div>
      ) : null}
      <div className="mt-auto pt-6">
        <Link
          className="inline-flex w-full items-center justify-center rounded-full bg-[#EF233C] px-5 py-3 text-sm font-black text-white shadow-lg shadow-red-950/10 transition hover:-translate-y-0.5 hover:bg-red-500"
          href={`/turnaje/${tournament.id}`}
        >
          Detail turnaje
        </Link>
      </div>
    </article>
  );
}

function InfoItem({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`rounded-2xl bg-[#F4F8FF] px-4 py-3 ${wide ? "sm:col-span-2" : ""}`}>
      <dt className="font-black text-slate-500">{label}</dt>
      <dd className="mt-1 font-black text-[#0B1F3A]">{value}</dd>
    </div>
  );
}

function RequestForm({
  onSubmit,
  tournamentType,
  isSubmitting,
  organizers,
}: {
  onSubmit: (request: MiniTournamentRequest) => Promise<boolean>;
  tournamentType: TournamentType;
  isSubmitting: boolean;
  organizers: OrganizerOption[];
}) {
  const [request, setRequest] = useState<MiniTournamentRequest>(emptyRequest);

  function updateField(field: keyof MiniTournamentRequest, value: string) {
    setRequest((current) => ({ ...current, [field]: value }));
  }

  function updatePoster(file: File | null) {
    if (!file) {
      setRequest((current) => ({ ...current, posterDataUrl: "" }));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setRequest((current) => ({ ...current, posterDataUrl: typeof reader.result === "string" ? reader.result : "" }));
    };
    reader.readAsDataURL(file);
  }

  function updatePart(partId: string, field: keyof Omit<TournamentRequestPartForm, "id">, value: string | boolean) {
    setRequest((current) => ({
      ...current,
      parts: current.parts.map((part) => (part.id === partId ? { ...part, [field]: value } : part)),
    }));
  }

  function addPart() {
    setRequest((current) => ({ ...current, parts: [...current.parts, emptyPart()] }));
  }

  function removePart(partId: string) {
    setRequest((current) => ({
      ...current,
      parts: current.parts.length > 1 ? current.parts.filter((part) => part.id !== partId) : current.parts,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const didSubmit = await onSubmit(tournamentType === "mini" ? { ...request, parts: request.parts.slice(0, 1) } : request);
    if (didSubmit) setRequest(emptyRequest);
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-black text-[#061A3A]">
          Tým / pořadatel
          <select
            className="min-h-12 rounded-2xl border border-[#D8E4F2] bg-white px-4 py-3 text-sm font-bold text-[#0B1F3A] outline-none transition focus:border-[#0F4FA8] focus:ring-4 focus:ring-blue-100"
            onChange={(event) => updateField("organizerTeamSeasonId", event.target.value)}
            required
            value={request.organizerTeamSeasonId}
          >
            <option value="">Vyberte tým</option>
            {organizers.map((organizer) => (
              <option key={organizer.teamSeasonId} value={organizer.teamSeasonId}>
                {organizer.name}{organizer.seasonName ? ` / ${organizer.seasonName}` : ""}
              </option>
            ))}
          </select>
        </label>
        <FormField label="Název turnaje" value={request.name} onChange={(value) => updateField("name", value)} />
        <FormField label="Datum" type="date" value={request.date} onChange={(value) => updateField("date", value)} />
        <FormField label="Místo" value={request.place} onChange={(value) => updateField("place", value)} />
        <FormField label="Počet míst" inputMode="numeric" value={request.capacity} onChange={(value) => updateField("capacity", value)} />
        <FormField label="Volných míst" inputMode="numeric" value={request.freeSlots} onChange={(value) => updateField("freeSlots", value)} />
      </div>

      <label className="grid gap-2 text-sm font-black text-[#061A3A]">
        Plakát turnaje
        <input
          accept="image/*"
          className="min-h-12 rounded-2xl border border-[#D8E4F2] bg-white px-4 py-3 text-sm font-bold text-[#0B1F3A] outline-none transition focus:border-[#0F4FA8] focus:ring-4 focus:ring-blue-100"
          onChange={(event) => updatePoster(event.target.files?.[0] ?? null)}
          type="file"
        />
        {request.posterDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt="Náhled plakátu" className="mt-2 max-h-64 w-fit rounded-2xl border border-[#D8E4F2] object-contain" src={request.posterDataUrl} />
        ) : null}
      </label>

      <div className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-black text-[#061A3A]">
            {tournamentType === "major" ? "Kategorie major turnaje" : "Kategorie turnaje"}
          </h3>
          {tournamentType === "major" ? (
            <button
              className="rounded-full border border-[#D8E4F2] bg-white px-4 py-2 text-sm font-black text-[#061A3A] transition hover:-translate-y-0.5 hover:bg-blue-50"
              onClick={addPart}
              type="button"
            >
              Přidat kategorii
            </button>
          ) : null}
        </div>

        {request.parts.map((part, index) => (
          <section className="grid gap-4 rounded-3xl border border-[#D8E4F2] bg-[#F4F8FF] p-4" key={part.id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-black text-[#061A3A]">Kategorie {index + 1}</p>
              {tournamentType === "major" && request.parts.length > 1 ? (
                <button
                  className="rounded-full border border-red-200 bg-white px-3 py-1.5 text-xs font-black text-[#EF233C]"
                  onClick={() => removePart(part.id)}
                  type="button"
                >
                  Odebrat
                </button>
              ) : null}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="Kategorie" value={part.category} onChange={(value) => updatePart(part.id, "category", value)} />
              <label className="flex min-h-12 items-center gap-3 rounded-2xl border border-[#D8E4F2] bg-white px-4 py-3 text-sm font-black text-[#061A3A]">
                <input
                  checked={part.isDoubles}
                  className="h-5 w-5 rounded border-[#D8E4F2]"
                  onChange={(event) => updatePart(part.id, "isDoubles", event.target.checked)}
                  type="checkbox"
                />
                Kategorie dvojic
              </label>
              <FormField label="Prezence" value={part.presentation} onChange={(value) => updatePart(part.id, "presentation", value)} />
              <FormField label="Začátek" value={part.startTime} onChange={(value) => updatePart(part.id, "startTime", value)} />
              <FormField label="Formát" value={part.format} onChange={(value) => updatePart(part.id, "format", value)} />
              <FormField label="Startovné" value={part.entryFee} onChange={(value) => updatePart(part.id, "entryFee", value)} />
            </div>
            <label className="grid gap-2 text-sm font-black text-[#061A3A]">
              Komentář
              <textarea
                className="min-h-24 rounded-2xl border border-[#D8E4F2] bg-white px-4 py-3 text-sm font-bold text-[#0B1F3A] outline-none transition focus:border-[#0F4FA8] focus:ring-4 focus:ring-blue-100"
                onChange={(event) => updatePart(part.id, "comment", event.target.value)}
                value={part.comment}
              />
            </label>
          </section>
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-3xl border border-[#D8E4F2] bg-[#F4F8FF] p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-bold leading-6 text-slate-600">
          Žádost po odeslání čeká na schválení moderátorem nebo administrátorem.
        </p>
        <button className="rounded-full bg-[#EF233C] px-5 py-3 text-sm font-black text-white shadow-lg shadow-red-950/10 transition hover:-translate-y-0.5 hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-70" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Odesílám..." : `Vytvořit žádost o ${tournamentType === "major" ? "major" : "mini"}`}
        </button>
      </div>
    </form>
  );
}

function FormField({
  label,
  value,
  onChange,
  type = "text",
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  inputMode?: "numeric";
}) {
  return (
    <label className="grid gap-2 text-sm font-black text-[#061A3A]">
      {label}
      <input
        className="min-h-12 rounded-2xl border border-[#D8E4F2] bg-white px-4 py-3 text-sm font-bold text-[#0B1F3A] outline-none transition focus:border-[#0F4FA8] focus:ring-4 focus:ring-blue-100"
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
        required
        type={type}
        value={value}
      />
    </label>
  );
}

export default function PublicTournamentsPage() {
  const [activeType, setActiveType] = useState<TournamentType>("major");
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [isLoadingOrganizers, setIsLoadingOrganizers] = useState(false);
  const [organizers, setOrganizers] = useState<OrganizerOption[]>([]);
  const [approvedTournaments, setApprovedTournaments] = useState<TournamentPreview[]>([]);
  const [requestMessage, setRequestMessage] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const allTournaments = useMemo(() => [...approvedTournaments, ...tournaments], [approvedTournaments]);
  const filteredTournaments = useMemo(() => allTournaments.filter((tournament) => tournament.type === activeType), [activeType, allTournaments]);
  const upcomingTournaments = filteredTournaments.filter((tournament) => tournament.status !== "played");
  const playedTournaments = filteredTournaments.filter((tournament) => tournament.status === "played");

  useEffect(() => {
    let isMounted = true;

    fetch("/api/public/tournaments", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as { tournaments?: TournamentPreview[] };
        if (isMounted && response.ok) setApprovedTournaments(body.tournaments ?? []);
      })
      .catch(() => {
        if (isMounted) setApprovedTournaments([]);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  async function loadOrganizers() {
    setIsLoadingOrganizers(true);
    setRequestError(null);

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    if (!token) {
      setOrganizers([]);
      setRequestError("Pro vytvoření žádosti o turnaj se nejprve přihlaste.");
      setIsLoadingOrganizers(false);
      return false;
    }

    const response = await fetch("/api/public/tournament-requests", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const body = (await response.json().catch(() => ({}))) as { organizers?: OrganizerOption[]; error?: string };

    setIsLoadingOrganizers(false);

    if (!response.ok) {
      setOrganizers([]);
      setRequestError(body.error ?? "Pořadatele se nepodařilo načíst.");
      return false;
    }

    const loadedOrganizers = body.organizers ?? [];
    setOrganizers(loadedOrganizers);

    if (loadedOrganizers.length === 0) {
      setRequestError("Nemáte žádný tým, za který můžete vytvořit žádost o turnaj.");
      return false;
    }

    return true;
  }

  async function handleRequestSubmit(request: MiniTournamentRequest) {
    setIsSubmittingRequest(true);
    setRequestError(null);
    setRequestMessage(null);

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    if (!token) {
      setIsSubmittingRequest(false);
      setRequestError("Pro vytvoření žádosti o turnaj se nejprve přihlaste.");
      return false;
    }

    const response = await fetch("/api/public/tournament-requests", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tournament_type: activeType,
        organizer_team_season_id: request.organizerTeamSeasonId,
        tournament_name: request.name,
        date: request.date,
        place: request.place,
        capacity: request.capacity,
        free_slots: request.freeSlots,
        poster_data_url: request.posterDataUrl,
        parts: request.parts.map((part) => ({
          category: part.category,
          is_doubles: part.isDoubles,
          presentation: part.presentation,
          start_time: part.startTime,
          format: part.format,
          entry_fee: part.entryFee,
          comment: part.comment,
        })),
      }),
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };

    setIsSubmittingRequest(false);

    if (!response.ok) {
      setRequestError(body.error ?? "Žádost o turnaj se nepodařilo uložit.");
      return false;
    }

    setRequestMessage(`Žádost o turnaj „${request.name}“ byla uložena a čeká na schválení.`);
    setIsRequestModalOpen(false);
    return true;
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#F4F8FF] text-[#0B1F3A]">
      <PublicHeader />

      <section className="relative isolate overflow-hidden bg-[#061A3A] text-white">
        <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_20%_15%,rgba(59,130,246,0.36),transparent_34%),radial-gradient(circle_at_90%_40%,rgba(239,35,60,0.24),transparent_30%),linear-gradient(135deg,#061A3A_0%,#0B2F6B_52%,#061A3A_100%)]" />
        <Image
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute -right-20 top-8 -z-10 h-auto w-[520px] max-w-[72vw] opacity-[0.08]"
          height={900}
          src="/brand/zss-logo.png"
          width={700}
        />
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
          <h1 className="text-5xl font-black tracking-tight sm:text-6xl">Turnaje</h1>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-black text-[#061A3A] shadow-lg shadow-black/15 transition hover:-translate-y-0.5 hover:bg-blue-50"
              href="/kalendar"
            >
              Kalendář akcí
            </Link>
            <button
              className="inline-flex items-center justify-center rounded-full bg-[#EF233C] px-6 py-3 text-sm font-black text-white shadow-lg shadow-red-950/25 transition hover:-translate-y-0.5 hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-70"
              disabled={isLoadingOrganizers}
              onClick={async () => {
                const canOpen = await loadOrganizers();
                if (canOpen) setIsRequestModalOpen(true);
              }}
              type="button"
            >
              {isLoadingOrganizers ? "Načítám týmy..." : "Vytvořit žádost"}
            </button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-[28px] border border-[#D8E4F2] bg-white p-2 shadow-[0_20px_60px_rgba(6,26,58,0.08)]">
          <div className="grid gap-2 sm:grid-cols-2">
            {(["major", "mini"] as TournamentType[]).map((type) => (
              <button
                className={`rounded-[24px] px-5 py-4 text-left transition ${
                  activeType === type
                    ? "bg-[#061A3A] text-white shadow-[0_16px_36px_rgba(6,26,58,0.22)]"
                    : "bg-[#F4F8FF] text-[#061A3A] hover:bg-blue-50"
                }`}
                key={type}
                onClick={() => setActiveType(type)}
                type="button"
              >
                <span className="block text-lg font-black">{tabCopy[type].title}</span>
                <span className={`mt-1 block text-sm font-bold leading-6 ${activeType === type ? "text-blue-100" : "text-slate-600"}`}>
                  {tabCopy[type].description}
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#EF233C]">Program</p>
            <h2 className="mt-1 text-3xl font-black tracking-tight text-[#061A3A]">{activeType === "major" ? "Major turnaje" : "Mini turnaje"}</h2>
          </div>
        </div>

        {upcomingTournaments.length === 0 ? (
          <div className="rounded-[28px] border border-[#D8E4F2] bg-white px-6 py-8 text-sm font-bold text-slate-500 shadow-[0_20px_60px_rgba(6,26,58,0.08)]">
            Turnaje zatím připravujeme.
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {upcomingTournaments.map((tournament) => (
              <TournamentCard key={tournament.id} tournament={tournament} />
            ))}
          </div>
        )}
      </section>

      {requestMessage ? (
        <section className="mx-auto max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-black text-emerald-700 shadow-[0_14px_36px_rgba(6,26,58,0.06)]">
            {requestMessage}
          </div>
        </section>
      ) : null}
      {requestError ? (
        <section className="mx-auto max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-black text-red-700 shadow-[0_14px_36px_rgba(6,26,58,0.06)]">
            {requestError}
          </div>
        </section>
      ) : null}

      <section className="mx-auto max-w-7xl px-4 pb-14 sm:px-6 lg:px-8">
        <section className="rounded-[28px] border border-[#D8E4F2] bg-white shadow-[0_20px_60px_rgba(6,26,58,0.08)]">
          <div className="border-b border-[#D8E4F2] px-5 py-5 sm:px-6">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#EF233C]">Archiv</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-[#061A3A]">Proběhlé turnaje</h2>
          </div>
          {playedTournaments.length === 0 ? (
            <p className="px-5 py-8 text-sm font-bold text-slate-500 sm:px-6">
              Zatím nejsou zadané žádné proběhlé {activeType === "major" ? "major turnaje" : "mini turnaje"}.
            </p>
          ) : (
            <div className="divide-y divide-[#D8E4F2]">
              {playedTournaments.map((tournament) => (
                <div className="px-5 py-4 sm:px-6" key={tournament.id}>
                  <p className="font-black text-[#061A3A]">{tournament.name}</p>
                  <p className="mt-1 text-sm font-bold text-slate-500">
                    {tournament.date} / {tournament.place}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </section>

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
              <p className="text-sm text-blue-200">Výsledky, tabulky a dění ze znojemských šipek.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-4 text-sm font-bold text-blue-100">
            <Link href="/">Úvod</Link>
            <Link href="/tabulky">Tabulky</Link>
            <Link href="/zapasy">Zápasy</Link>
            <Link href="/turnaje">Turnaje</Link>
            <Link href="/prihlaseni">Přihlášení</Link>
          </div>
        </div>
      </footer>

      {isRequestModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#061A3A]/70 px-4 py-6 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[28px] border border-[#D8E4F2] bg-white shadow-[0_30px_90px_rgba(6,26,58,0.35)]">
            <div className="flex flex-col gap-4 border-b border-[#D8E4F2] px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#EF233C]">Žádost pořadatele</p>
                <h2 className="mt-1 text-2xl font-black tracking-tight text-[#061A3A]">
                  Vytvořit žádost o {activeType === "major" ? "major" : "mini"} turnaj
                </h2>
                <p className="mt-2 max-w-3xl text-sm font-bold leading-6 text-slate-600">
                  Kapitán nebo zástupce týmu vyplní parametry turnaje. Moderátor nebo administrátor potom žádost schválí před zveřejněním.
                </p>
              </div>
              <button
                aria-label="Zavřít okno"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#D8E4F2] bg-[#F4F8FF] text-xl font-black text-[#061A3A] transition hover:-translate-y-0.5 hover:bg-blue-50"
                onClick={() => setIsRequestModalOpen(false)}
                type="button"
              >
                ×
              </button>
            </div>
            <div className="p-5 sm:p-6">
              <RequestForm
                isSubmitting={isSubmittingRequest}
                onSubmit={handleRequestSubmit}
                organizers={organizers}
                tournamentType={activeType}
              />
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

