"use client";

import { adminFetch } from "@/lib/adminFetch";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Season = {
  id: string;
  name: string;
  is_active: boolean;
  starts_on: string;
};

type League = {
  id: string;
  season_id: string;
  name: string;
};

type ImportPayload = {
  seasons?: Season[];
  leagues?: League[];
  imported?: number;
  groups?: number;
  teams?: number;
  error?: string;
};

async function readJson(response: Response) {
  return (await response.json().catch(() => ({}))) as ImportPayload;
}

export default function AdminImportMatchesPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [seasonId, setSeasonId] = useState("");
  const [leagueId, setLeagueId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filteredLeagues = useMemo(
    () => leagues.filter((league) => league.season_id === seasonId),
    [leagues, seasonId],
  );

  useEffect(() => {
    let isMounted = true;

    adminFetch("/api/admin/import/matches")
      .then(async (response) => {
        const body = await readJson(response);
        if (!response.ok) {
          throw new Error(body.error ?? "Import se nepodařilo načíst.");
        }

        if (!isMounted) return;

        const nextSeasons = body.seasons ?? [];
        const nextLeagues = body.leagues ?? [];
        const defaultSeasonId = nextSeasons.find((season) => season.is_active)?.id || nextSeasons[0]?.id || "";
        const defaultLeagueId = nextLeagues.find((league) => league.season_id === defaultSeasonId)?.id || "";

        setSeasons(nextSeasons);
        setLeagues(nextLeagues);
        setSeasonId(defaultSeasonId);
        setLeagueId(defaultLeagueId);
        setIsLoading(false);
      })
      .catch((loadError) => {
        if (!isMounted) return;
        setError(loadError instanceof Error ? loadError.message : "Import se nepodařilo načíst.");
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !seasonId || !leagueId) return;

    setIsImporting(true);
    setMessage(null);
    setError(null);

    const formData = new FormData();
    formData.set("season_id", seasonId);
    formData.set("league_id", leagueId);
    formData.set("file", file);

    const response = await adminFetch("/api/admin/import/matches", {
      method: "POST",
      body: formData,
    });
    const body = await readJson(response);

    if (!response.ok) {
      setError(body.error ?? "Import zápasů se nepodařil.");
    } else {
      setMessage(`Import hotov: ${body.imported ?? 0} zápasů, ${body.groups ?? 0} skupin, ${body.teams ?? 0} týmů.`);
      setFile(null);
      event.currentTarget.reset();
    }

    setIsImporting(false);
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-sm font-medium text-slate-500">Administrace</p>
        <h2 className="mt-2 text-3xl font-bold">Import zápasů</h2>
      </header>

      <section className="rounded-lg bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-lg font-semibold">Import zápasů</h3>
            <p className="mt-1 text-sm text-slate-600">
              Nahraje CSV, založí chybějící skupiny a týmy v sezoně a vytvoří zápasy.
            </p>
          </div>
          <a
            className="inline-flex w-fit rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            href="/import-templates/zapasy_2026_2027_import.csv"
          >
            Stáhnout vzorové CSV
          </a>
        </div>

        {isLoading ? (
          <p className="mt-6 text-sm font-bold text-slate-500">Načítám nastavení importu...</p>
        ) : (
          <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Sezóna
              <select
                className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
                required
                value={seasonId}
                onChange={(event) => {
                  const nextSeasonId = event.target.value;
                  setSeasonId(nextSeasonId);
                  setLeagueId(leagues.find((league) => league.season_id === nextSeasonId)?.id || "");
                }}
              >
                <option value="">Vyberte sezonu</option>
                {seasons.map((season) => (
                  <option key={season.id} value={season.id}>
                    {season.name}
                    {season.is_active ? " - aktivní" : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm font-medium">
              Liga
              <select
                className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
                required
                value={leagueId}
                onChange={(event) => setLeagueId(event.target.value)}
              >
                <option value="">Vyberte ligu</option>
                {filteredLeagues.map((league) => (
                  <option key={league.id} value={league.id}>
                    {league.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm font-medium">
              CSV soubor
              <input
                accept=".csv,text/csv"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none file:mr-4 file:rounded-md file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white focus:border-slate-700"
                required
                type="file"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>

            <button
              className="w-fit rounded-xl bg-[#EF233C] px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#C91D32] disabled:cursor-not-allowed disabled:bg-slate-400"
              disabled={isImporting || !file || !seasonId || !leagueId}
              type="submit"
            >
              {isImporting ? "Importuji..." : "Importovat zápasy"}
            </button>
          </form>
        )}

        {message ? <div className="mt-5 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-800">{message}</div> : null}
        {error ? <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}
      </section>
    </div>
  );
}
