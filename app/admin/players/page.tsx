"use client";

import { FormEvent, useEffect, useState } from "react";

const mockRole = "admin";

type Player = {
  id: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  created_at: string;
};

type PlayerForm = {
  display_name: string;
  first_name: string;
  last_name: string;
  nickname: string;
};

const emptyForm: PlayerForm = {
  display_name: "",
  first_name: "",
  last_name: "",
  nickname: "",
};

async function fetchPlayers() {
  const response = await fetch("/api/admin/players");
  const body = await response.json();

  if (!response.ok) {
    throw new Error("Nepodařilo se načíst hráče.");
  }

  return (body.players ?? []) as Player[];
}

export default function AdminPlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [form, setForm] = useState<PlayerForm>(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canManagePlayers = mockRole === "admin";

  async function loadPlayers(showLoading = true) {
    if (showLoading) {
      setIsLoading(true);
    }

    setError(null);

    try {
      setPlayers(await fetchPlayers());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Nepodařilo se načíst hráče.");
      setPlayers([]);
    }

    setIsLoading(false);
  }

  useEffect(() => {
    let isMounted = true;

    fetchPlayers()
      .then((loadedPlayers) => {
        if (!isMounted) {
          return;
        }

        setPlayers(loadedPlayers);
        setIsLoading(false);
      })
      .catch((loadError) => {
        if (!isMounted) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : "Nepodařilo se načíst hráče.");
        setPlayers([]);
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManagePlayers || !form.display_name.trim()) {
      return;
    }

    setIsSaving(true);
    setError(null);

    const response = await fetch("/api/admin/players", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        display_name: form.display_name.trim(),
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        nickname: form.nickname.trim(),
      }),
    });

    await response.json().catch(() => ({}));

    if (!response.ok) {
      setError("Nepodařilo se vytvořit hráče.");
    } else {
      setForm(emptyForm);
      await loadPlayers();
    }

    setIsSaving(false);
  }

  return (
    <div className="flex flex-col gap-8">
        <header>
          <p className="text-sm font-medium text-slate-500">Administrace</p>
          <h2 className="mt-2 text-3xl font-bold">Hráči</h2>
        </header>

        {!canManagePlayers ? (
          <section className="rounded-lg bg-white p-6 shadow-sm">
            <p className="text-sm text-slate-600">
              Aktuální testovací role neumožňuje správu hráčů.
            </p>
          </section>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
            <section className="rounded-lg bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold">Vytvořit hráče</h3>

              <form className="mt-5 flex flex-col gap-4" onSubmit={handleSubmit}>
                <label className="flex flex-col gap-1 text-sm font-medium">
                  Zobrazované jméno
                  <input
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
                    required
                    value={form.display_name}
                    onChange={(event) =>
                      setForm({ ...form, display_name: event.target.value })
                    }
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm font-medium">
                  Jméno
                  <input
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
                    value={form.first_name}
                    onChange={(event) =>
                      setForm({ ...form, first_name: event.target.value })
                    }
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm font-medium">
                  Příjmení
                  <input
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
                    value={form.last_name}
                    onChange={(event) =>
                      setForm({ ...form, last_name: event.target.value })
                    }
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm font-medium">
                  Přezdívka
                  <input
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
                    value={form.nickname}
                    onChange={(event) =>
                      setForm({ ...form, nickname: event.target.value })
                    }
                  />
                </label>

                <button
                  className="mt-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
                  disabled={isSaving}
                  type="submit"
                >
                  {isSaving ? "Ukládám..." : "Vytvořit hráče"}
                </button>
              </form>
            </section>

            <section className="rounded-lg bg-white shadow-sm">
              <div className="border-b border-slate-200 px-6 py-4">
                <h3 className="text-lg font-semibold">Seznam hráčů</h3>
              </div>

              {error ? (
                <div className="px-6 py-5 text-sm text-red-700">{error}</div>
              ) : null}

              {isLoading ? (
                <div className="px-6 py-5 text-sm text-slate-500">
                  Načítám hráče...
                </div>
              ) : players.length === 0 ? (
                <div className="px-6 py-5 text-sm text-slate-500">
                  Nebyli nalezeni žádní hráči.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-6 py-3 font-semibold">Zobrazované jméno</th>
                        <th className="px-6 py-3 font-semibold">Jméno</th>
                        <th className="px-6 py-3 font-semibold">Příjmení</th>
                        <th className="px-6 py-3 font-semibold">Přezdívka</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {players.map((player) => (
                        <tr key={player.id}>
                          <td className="px-6 py-4 font-medium">
                            {player.display_name}
                          </td>
                          <td className="px-6 py-4 text-slate-600">
                            {player.first_name || "-"}
                          </td>
                          <td className="px-6 py-4 text-slate-600">
                            {player.last_name || "-"}
                          </td>
                          <td className="px-6 py-4 text-slate-600">
                            {player.nickname || "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
    </div>
  );
}
