"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PublicFooter, PublicHeader } from "@/components/public/PublicShell";
import { supabase } from "@/lib/supabase";
import type { TournamentRequestPart, TournamentSetup, TournamentSetupPlayer } from "@/lib/tournamentRequests";

type RouteParams = {
  params: Promise<{ id: string }>;
};

type TournamentDetail = {
  id: string;
  name: string;
  type: "major" | "mini";
  date: string;
  place: string;
  capacity: string;
  freeSlots: string;
  posterDataUrl: string;
  organizerName: string;
  parts: TournamentRequestPart[];
  setup: TournamentSetup | null;
};

type DetailPayload = {
  tournament?: TournamentDetail;
  canManage?: boolean;
  playerOptions?: PlayerOption[];
  error?: string;
};

type PlayerOption = {
  id: string;
  name: string;
  isRegistered: boolean;
};

function formatDate(value: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("cs-CZ", { dateStyle: "full" }).format(new Date(`${value}T00:00:00`));
}

function shuffle<T>(items: T[]) {
  return [...items].sort(() => Math.random() - 0.5);
}

function createManualPlayer(name = ""): TournamentSetupPlayer {
  return {
    id: crypto.randomUUID(),
    player_id: null,
    name,
    is_registered: false,
    partner_player_id: null,
    partner_name: "",
    partner_is_registered: false,
    team_name: "",
  };
}

function participantLabel(player: TournamentSetupPlayer, isDoubles: boolean) {
  if (!isDoubles) return player.name;
  return player.team_name || [player.name, player.partner_name].filter(Boolean).join(" / ") || "Dvojice bez názvu";
}

function participantRegistrationLabel(player: TournamentSetupPlayer, isDoubles: boolean) {
  if (!isDoubles) return player.is_registered ? "registrovaný" : "mimo soupisku";
  if (player.is_registered && player.partner_is_registered) return "oba registrovaní";
  if (player.is_registered || player.partner_is_registered) return "částečně registrovaní";
  return "mimo soupisku";
}

function participantRegistrationClass(player: TournamentSetupPlayer, isDoubles: boolean) {
  if (!isDoubles) return player.is_registered ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-800";
  if (player.is_registered && player.partner_is_registered) return "bg-green-50 text-green-800";
  if (player.is_registered || player.partner_is_registered) return "bg-blue-50 text-[#0F4FA8]";
  return "bg-amber-50 text-amber-800";
}

export default function TournamentDetailPage({ params }: RouteParams) {
  const [id, setId] = useState("");
  const [tournament, setTournament] = useState<TournamentDetail | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<"setup" | "progress" | null>(null);
  const [setup, setSetup] = useState<TournamentSetup>({ board_count: 1, category_settings: [] });
  const [playerOptions, setPlayerOptions] = useState<PlayerOption[]>([]);
  const [matchResults, setMatchResults] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void params.then((resolved) => setId(resolved.id));
  }, [params]);

  useEffect(() => {
    if (!id) return;
    let isMounted = true;

    async function loadDetail() {
      setIsLoading(true);
      setError(null);
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const response = await fetch(`/api/public/tournaments/${id}`, {
        cache: "no-store",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const body = (await response.json().catch(() => ({}))) as DetailPayload;

      if (!isMounted) return;
      if (!response.ok || !body.tournament) {
        setError(body.error ?? "Turnaj se nepodařilo načíst.");
        setIsLoading(false);
        return;
      }

      setTournament(body.tournament);
      setCanManage(Boolean(body.canManage));
      setPlayerOptions(body.playerOptions ?? []);
      setSetup(body.tournament.setup ?? {
        board_count: 1,
        category_settings: body.tournament.parts.map((part) => ({
          part_id: part.id,
          category: part.category,
          is_doubles: part.is_doubles,
          player_count: 0,
          board_numbers: [1],
          players: [],
        })),
      });
      setIsLoading(false);
    }

    void loadDetail();
    return () => {
      isMounted = false;
    };
  }, [id]);

  const boardNumbers = useMemo(
    () => Array.from({ length: Math.max(1, setup.board_count) }, (_, index) => index + 1),
    [setup.board_count],
  );

  async function saveSetup() {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const response = await fetch(`/api/public/tournaments/${id}`, {
      method: "PATCH",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ setup }),
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string; setup?: TournamentSetup };

    if (!response.ok) {
      setError(body.error ?? "Nastavení se nepodařilo uložit.");
      return;
    }

    setTournament((current) => current ? { ...current, setup: body.setup ?? setup } : current);
    setMessage("Nastavení turnaje bylo uloženo.");
    setActiveModal(null);
  }

  function updateCategory(partId: string, patch: Partial<TournamentSetup["category_settings"][number]>) {
    setSetup((current) => ({
      ...current,
      category_settings: current.category_settings.map((category) => category.part_id === partId ? { ...category, ...patch } : category),
    }));
  }

  function setPlayerCount(partId: string, value: number) {
    const playerCount = Math.max(0, Math.floor(value) || 0);
    setSetup((current) => ({
      ...current,
      category_settings: current.category_settings.map((category) => {
        if (category.part_id !== partId) return category;
        const nextPlayers = [...category.players];
        while (nextPlayers.length < playerCount) nextPlayers.push(createManualPlayer());
        return { ...category, player_count: playerCount, players: nextPlayers.slice(0, playerCount) };
      }),
    }));
  }

  function addPlayer(partId: string) {
    setSetup((current) => ({
      ...current,
      category_settings: current.category_settings.map((category) => {
        if (category.part_id !== partId) return category;
        const players = [...category.players, createManualPlayer()];
        return { ...category, player_count: players.length, players };
      }),
    }));
  }

  function removePlayer(partId: string, playerRowId: string) {
    setSetup((current) => ({
      ...current,
      category_settings: current.category_settings.map((category) => {
        if (category.part_id !== partId) return category;
        const players = category.players.filter((player) => player.id !== playerRowId);
        return { ...category, player_count: players.length, players };
      }),
    }));
  }

  function updatePlayer(partId: string, playerRowId: string, patch: Partial<TournamentSetupPlayer>) {
    setSetup((current) => ({
      ...current,
      category_settings: current.category_settings.map((category) => category.part_id === partId
        ? {
            ...category,
            players: category.players.map((player) => player.id === playerRowId ? { ...player, ...patch } : player),
          }
        : category),
    }));
  }

  function selectPlayer(partId: string, playerRowId: string, playerId: string) {
    const option = playerOptions.find((player) => player.id === playerId);
    updatePlayer(partId, playerRowId, option
      ? { player_id: option.id, name: option.name, is_registered: option.isRegistered }
      : { player_id: null, name: "", is_registered: false });
  }

  function selectPartner(partId: string, playerRowId: string, playerId: string) {
    const option = playerOptions.find((player) => player.id === playerId);
    updatePlayer(partId, playerRowId, option
      ? { partner_player_id: option.id, partner_name: option.name, partner_is_registered: option.isRegistered }
      : { partner_player_id: null, partner_name: "", partner_is_registered: false });
  }

  const groups = useMemo(() => {
    return setup.category_settings.flatMap((category) => {
      const players = shuffle(category.players);
      const boards = category.board_numbers.length > 0 ? category.board_numbers : boardNumbers;
      return boards.map((board, boardIndex) => ({
        category: category.category,
        board,
        players: players.filter((_, playerIndex) => playerIndex % boards.length === boardIndex),
        isDoubles: category.is_doubles,
      }));
    });
  }, [boardNumbers, setup.category_settings]);

  const groupMatches = useMemo(() => {
    return groups.flatMap((group) => {
      const matches: Array<{ id: string; category: string; board: number; isDoubles: boolean; home: TournamentSetupPlayer; away: TournamentSetupPlayer }> = [];
      for (let left = 0; left < group.players.length; left += 1) {
        for (let right = left + 1; right < group.players.length; right += 1) {
          matches.push({
            id: `${group.category}-${group.board}-${group.players[left].id}-${group.players[right].id}`,
            category: group.category,
            board: group.board,
            isDoubles: group.isDoubles,
            home: group.players[left],
            away: group.players[right],
          });
        }
      }
      return matches;
    });
  }, [groups]);

  if (isLoading) {
    return <main className="min-h-screen bg-[#F4F8FF]"><PublicHeader activeHref="/turnaje" /><div className="mx-auto max-w-7xl px-4 py-10 text-sm font-bold text-slate-600">Načítám turnaj...</div></main>;
  }

  if (error || !tournament) {
    return (
      <main className="min-h-screen bg-[#F4F8FF]">
        <PublicHeader activeHref="/turnaje" />
        <div className="mx-auto max-w-7xl px-4 py-10">
          <div className="rounded-3xl border border-red-200 bg-red-50 p-5 text-sm font-black text-red-700">{error ?? "Turnaj nebyl nalezen."}</div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F4F8FF] text-[#0B1F3A]">
      <PublicHeader activeHref="/turnaje" />
      <section className="bg-[#061A3A] text-white">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <Link className="text-sm font-black text-blue-100" href="/turnaje">Zpět na turnaje</Link>
          <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#EF233C]">{tournament.type === "major" ? "Major turnaj" : "Mini turnaj"}</p>
              <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-6xl">{tournament.name}</h1>
              <p className="mt-4 text-lg font-bold text-blue-100">{formatDate(tournament.date)} / {tournament.place}</p>
              <p className="mt-2 text-sm font-bold text-blue-100">Pořadatel: {tournament.organizerName}</p>
              {canManage ? (
                <div className="mt-6 flex flex-wrap gap-3">
                  <button className="rounded-full bg-white px-5 py-3 text-sm font-black text-[#061A3A]" onClick={() => setActiveModal("setup")} type="button">Nastavit turnaj</button>
                  <button className="rounded-full bg-[#EF233C] px-5 py-3 text-sm font-black text-white" onClick={() => setActiveModal("progress")} type="button">Průběh turnaje</button>
                </div>
              ) : null}
            </div>
            {tournament.posterDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt={`Plakát ${tournament.name}`} className="w-full rounded-3xl border border-white/10 bg-white object-contain shadow-2xl" src={tournament.posterDataUrl} />
            ) : null}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:px-8">
        {message ? <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-800">{message}</div> : null}
        <div className="grid gap-4 md:grid-cols-3">
          <Info label="Počet míst" value={tournament.capacity || "-"} />
          <Info label="Volná místa" value={tournament.freeSlots || "-"} />
          <Info label="Počet kategorií" value={String(tournament.parts.length)} />
        </div>
        <section className="rounded-3xl border border-[#D8E4F2] bg-white p-5 shadow-[0_20px_60px_rgba(6,26,58,0.08)]">
          <h2 className="text-2xl font-black text-[#061A3A]">Kategorie</h2>
          <div className="mt-4 grid gap-4">
            {tournament.parts.map((part) => (
              <article className="rounded-2xl bg-[#F4F8FF] p-4" key={part.id}>
                <h3 className="text-lg font-black text-[#061A3A]">{part.category}</h3>
                {part.is_doubles ? <p className="mt-1 text-xs font-black uppercase tracking-[0.12em] text-[#0F4FA8]">Dvojice</p> : null}
                <div className="mt-3 grid gap-3 text-sm sm:grid-cols-4">
                  <Info label="Prezence" value={part.presentation} />
                  <Info label="Začátek" value={part.start_time} />
                  <Info label="Formát" value={part.format} />
                  <Info label="Startovné" value={part.entry_fee} />
                </div>
                {part.comment ? <p className="mt-3 text-sm font-bold text-slate-600">{part.comment}</p> : null}
              </article>
            ))}
          </div>
        </section>
      </section>

      {activeModal === "setup" ? (
        <Modal title="Nastavit turnaj" onClose={() => setActiveModal(null)}>
          <label className="grid gap-2 text-sm font-black text-[#061A3A]">
            Počet terčů
            <input className="rounded-2xl border border-[#D8E4F2] px-4 py-3" min={1} onChange={(event) => setSetup((current) => ({ ...current, board_count: Number(event.target.value) }))} type="number" value={setup.board_count} />
          </label>
          <div className="mt-4 flex flex-wrap gap-2">
            {boardNumbers.map((board) => <span className="rounded-full bg-[#F4F8FF] px-3 py-1 text-sm font-black text-[#061A3A]" key={board}>Terč {board}</span>)}
          </div>
          <div className="mt-6 grid gap-4">
            {setup.category_settings.map((category) => (
              <section className="rounded-2xl border border-[#D8E4F2] p-4" key={category.part_id}>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-black text-[#061A3A]">{category.category}</h3>
                  {category.is_doubles ? <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-[#0F4FA8]">Dvojice</span> : null}
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="grid gap-2 text-sm font-black">{category.is_doubles ? "Počet dvojic" : "Počet hráčů"}<input className="rounded-2xl border border-[#D8E4F2] px-4 py-3" min={0} type="number" value={category.player_count} onChange={(event) => setPlayerCount(category.part_id, Number(event.target.value))} /></label>
                  <label className="grid gap-2 text-sm font-black">Terče pro kategorii<input className="rounded-2xl border border-[#D8E4F2] px-4 py-3" value={category.board_numbers.join(", ")} onChange={(event) => updateCategory(category.part_id, { board_numbers: event.target.value.split(",").map((item) => Number(item.trim())).filter(Boolean) })} /></label>
                </div>
                <div className="mt-4 grid gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-sm font-black text-[#061A3A]">{category.is_doubles ? "Dvojice" : "Hráči"}</h4>
                    <button className="rounded-full border border-[#D8E4F2] px-4 py-2 text-xs font-black text-[#061A3A]" onClick={() => addPlayer(category.part_id)} type="button">{category.is_doubles ? "Přidat dvojici" : "Přidat hráče"}</button>
                  </div>
                  {category.players.length === 0 ? (
                    <div className="rounded-2xl bg-[#F4F8FF] px-4 py-3 text-sm font-bold text-slate-600">{category.is_doubles ? "Zatím není přidaná žádná dvojice." : "Zatím není přidaný žádný hráč."}</div>
                  ) : null}
                  {category.players.map((player, playerIndex) => category.is_doubles ? (
                    <div className="grid gap-3 rounded-2xl border border-[#D8E4F2] p-3" key={player.id}>
                      <div className="grid gap-3 md:grid-cols-[48px_minmax(0,1fr)] md:items-end">
                        <div className="rounded-2xl bg-[#F4F8FF] px-3 py-3 text-center text-sm font-black text-[#061A3A]">{playerIndex + 1}</div>
                        <label className="grid gap-2 text-sm font-black">
                          Název dvojice
                          <input
                            className="rounded-2xl border border-[#D8E4F2] px-4 py-3"
                            onChange={(event) => updatePlayer(category.part_id, player.id, { team_name: event.target.value })}
                            placeholder="Název týmu dvojic"
                            value={player.team_name}
                          />
                        </label>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="grid gap-2 text-sm font-black">
                          Hráč 1 ze systému
                          <select className="rounded-2xl border border-[#D8E4F2] px-4 py-3" onChange={(event) => selectPlayer(category.part_id, player.id, event.target.value)} value={player.player_id ?? ""}>
                            <option value="">Ruční zadání</option>
                            {playerOptions.map((option) => (
                              <option key={option.id} value={option.id}>{option.name} / {option.isRegistered ? "registrovaný" : "neregistrovaný"}</option>
                            ))}
                          </select>
                        </label>
                        <label className="grid gap-2 text-sm font-black">
                          Jméno hráče 1
                          <input
                            className="rounded-2xl border border-[#D8E4F2] px-4 py-3"
                            disabled={Boolean(player.player_id)}
                            onChange={(event) => updatePlayer(category.part_id, player.id, { name: event.target.value, player_id: null, is_registered: false })}
                            placeholder="Nové jméno"
                            value={player.name}
                          />
                        </label>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="grid gap-2 text-sm font-black">
                          Hráč 2 ze systému
                          <select className="rounded-2xl border border-[#D8E4F2] px-4 py-3" onChange={(event) => selectPartner(category.part_id, player.id, event.target.value)} value={player.partner_player_id ?? ""}>
                            <option value="">Ruční zadání</option>
                            {playerOptions.map((option) => (
                              <option key={option.id} value={option.id}>{option.name} / {option.isRegistered ? "registrovaný" : "neregistrovaný"}</option>
                            ))}
                          </select>
                        </label>
                        <label className="grid gap-2 text-sm font-black">
                          Jméno hráče 2
                          <input
                            className="rounded-2xl border border-[#D8E4F2] px-4 py-3"
                            disabled={Boolean(player.partner_player_id)}
                            onChange={(event) => updatePlayer(category.part_id, player.id, { partner_name: event.target.value, partner_player_id: null, partner_is_registered: false })}
                            placeholder="Nové jméno"
                            value={player.partner_name}
                          />
                        </label>
                      </div>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                        <div className={`rounded-2xl px-3 py-3 text-center text-xs font-black ${participantRegistrationClass(player, category.is_doubles)}`}>
                          {participantRegistrationLabel(player, category.is_doubles)}
                        </div>
                        <button className="rounded-full border border-red-200 px-4 py-3 text-xs font-black text-red-700" onClick={() => removePlayer(category.part_id, player.id)} type="button">Odebrat</button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-3 rounded-2xl border border-[#D8E4F2] p-3 md:grid-cols-[48px_minmax(0,1fr)_minmax(0,1fr)_120px_96px] md:items-end" key={player.id}>
                      <div className="rounded-2xl bg-[#F4F8FF] px-3 py-3 text-center text-sm font-black text-[#061A3A]">{playerIndex + 1}</div>
                      <label className="grid gap-2 text-sm font-black">
                        Hráč ze systému
                        <select className="rounded-2xl border border-[#D8E4F2] px-4 py-3" onChange={(event) => selectPlayer(category.part_id, player.id, event.target.value)} value={player.player_id ?? ""}>
                          <option value="">Ruční zadání</option>
                          {playerOptions.map((option) => (
                            <option key={option.id} value={option.id}>{option.name} / {option.isRegistered ? "registrovaný" : "neregistrovaný"}</option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-2 text-sm font-black">
                        Jméno
                        <input
                          className="rounded-2xl border border-[#D8E4F2] px-4 py-3"
                          disabled={Boolean(player.player_id)}
                          onChange={(event) => updatePlayer(category.part_id, player.id, { name: event.target.value, player_id: null, is_registered: false })}
                          placeholder="Nové jméno"
                          value={player.name}
                        />
                      </label>
                      <div className={`rounded-2xl px-3 py-3 text-center text-xs font-black ${participantRegistrationClass(player, category.is_doubles)}`}>
                        {participantRegistrationLabel(player, category.is_doubles)}
                      </div>
                      <button className="rounded-full border border-red-200 px-4 py-3 text-xs font-black text-red-700" onClick={() => removePlayer(category.part_id, player.id)} type="button">Odebrat</button>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
          <button className="mt-5 rounded-full bg-[#EF233C] px-5 py-3 text-sm font-black text-white" onClick={saveSetup} type="button">Uložit nastavení</button>
        </Modal>
      ) : null}

      {activeModal === "progress" ? (
        <Modal title="Průběh turnaje" onClose={() => setActiveModal(null)}>
          <h3 className="text-lg font-black text-[#061A3A]">Základní skupiny</h3>
          <p className="mt-1 text-sm font-bold text-slate-600">Hráči jsou rozhozeni do skupin podle dostupných terčů dané kategorie.</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {groups.map((group) => (
              <section className="rounded-2xl border border-[#D8E4F2] p-4" key={`${group.category}-${group.board}`}>
                <h4 className="font-black text-[#061A3A]">{group.category} / Terč {group.board}</h4>
                <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm font-bold text-slate-700">
                  {group.players.map((player) => (
                    <li key={player.id}>
                      {participantLabel(player, group.isDoubles)}
                      {group.isDoubles && (player.name || player.partner_name) ? <span className="ml-2 text-xs text-slate-500">({[player.name, player.partner_name].filter(Boolean).join(" / ")})</span> : null}
                      <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-black ${participantRegistrationClass(player, group.isDoubles)}`}>
                        {participantRegistrationLabel(player, group.isDoubles)}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
          <h3 className="mt-6 text-lg font-black text-[#061A3A]">Double KO pavouk</h3>
          <p className="mt-1 text-sm font-bold text-slate-600">Nasazení naváže na pořadí ze základních skupin. Zatím je připravený řídicí panel pro výsledky skupin a přehled zápasů na terčích.</p>
          <div className="mt-4 grid gap-3">
            {groupMatches.map((match) => (
              <div className="grid gap-2 rounded-2xl border border-[#D8E4F2] p-3 text-sm md:grid-cols-[1fr_120px]" key={match.id}>
                <div>
                  <p className="font-black text-[#061A3A]">{match.category} / Terč {match.board}</p>
                  <p className="mt-1 font-bold text-slate-700">{participantLabel(match.home, match.isDoubles)} vs. {participantLabel(match.away, match.isDoubles)}</p>
                </div>
                <input
                  className="rounded-xl border border-[#D8E4F2] px-3 py-2 font-black"
                  onChange={(event) => setMatchResults((current) => ({ ...current, [match.id]: event.target.value }))}
                  placeholder="Výsledek"
                  value={matchResults[match.id] ?? ""}
                />
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-2xl bg-[#F4F8FF] p-4 text-sm font-bold text-slate-600">Další krok bude automatické seřazení skupin a vygenerování winners/losers double KO pavouka.</div>
        </Modal>
      ) : null}

      <PublicFooter />
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[#F4F8FF] px-4 py-3">
      <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-1 font-black text-[#061A3A]">{value}</p>
    </div>
  );
}

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#061A3A]/70 px-4 py-6 backdrop-blur-sm">
      <section className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-[28px] border border-[#D8E4F2] bg-white p-5 shadow-[0_30px_90px_rgba(6,26,58,0.35)]">
        <div className="flex items-start justify-between gap-4 border-b border-[#D8E4F2] pb-4">
          <h2 className="text-2xl font-black text-[#061A3A]">{title}</h2>
          <button className="rounded-full border border-[#D8E4F2] px-4 py-2 font-black text-[#061A3A]" onClick={onClose} type="button">Zavřít</button>
        </div>
        <div className="pt-5">{children}</div>
      </section>
    </div>
  );
}
