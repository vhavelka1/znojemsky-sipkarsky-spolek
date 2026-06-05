"use client";

import { FormEvent, useEffect, useState } from "react";

const mockRole = "admin";

type Player = {
  id: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
  residence: string | null;
  email: string | null;
  created_at: string;
};

type PlayerForm = {
  display_name: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  residence: string;
  email: string;
};

const emptyForm: PlayerForm = {
  display_name: "",
  first_name: "",
  last_name: "",
  date_of_birth: "",
  residence: "",
  email: "",
};

async function fetchPlayers() {
  const response = await fetch("/api/admin/players");
  const body = await response.json();

  if (!response.ok) {
    throw new Error(body.error ?? "Nepodařilo se načíst hráče.");
  }

  return (body.players ?? []) as Player[];
}

function playerToForm(player: Player): PlayerForm {
  return {
    display_name: player.display_name,
    first_name: player.first_name ?? "",
    last_name: player.last_name ?? "",
    date_of_birth: player.date_of_birth ?? "",
    residence: player.residence ?? "",
    email: player.email ?? "",
  };
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("cs-CZ", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function emptyText(value: string | null) {
  return value?.trim() ? value : "-";
}

export default function AdminPlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [form, setForm] = useState<PlayerForm>(emptyForm);
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canManagePlayers = mockRole === "admin";
  const isEditing = Boolean(editingPlayerId);

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

  function startEditing(player: Player) {
    setEditingPlayerId(player.id);
    setForm(playerToForm(player));
    setError(null);
  }

  function resetForm() {
    setEditingPlayerId(null);
    setForm(emptyForm);
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManagePlayers || !form.display_name.trim()) {
      return;
    }

    setIsSaving(true);
    setError(null);

    const payload = {
      display_name: form.display_name.trim(),
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      date_of_birth: form.date_of_birth,
      residence: form.residence.trim(),
      email: form.email.trim(),
    };
    const response = await fetch(
      editingPlayerId ? `/api/admin/players/${editingPlayerId}` : "/api/admin/players",
      {
        method: editingPlayerId ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      setError(body.error ?? (isEditing ? "Nepodařilo se upravit hráče." : "Nepodařilo se vytvořit hráče."));
    } else {
      resetForm();
      await loadPlayers(false);
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
        <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
          <section className="rounded-lg bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">
                  {isEditing ? "Upravit hráče" : "Vytvořit hráče"}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Povinné je pouze zobrazované jméno.
                </p>
              </div>
              {isEditing ? (
                <button
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={resetForm}
                  type="button"
                >
                  Zrušit
                </button>
              ) : null}
            </div>

            <form className="mt-5 flex flex-col gap-4" onSubmit={handleSubmit}>
              <label className="flex flex-col gap-1 text-sm font-medium">
                Zobrazované jméno
                <input
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
                  required
                  value={form.display_name}
                  onChange={(event) => setForm({ ...form, display_name: event.target.value })}
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm font-medium">
                  Jméno
                  <input
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
                    value={form.first_name}
                    onChange={(event) => setForm({ ...form, first_name: event.target.value })}
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm font-medium">
                  Příjmení
                  <input
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
                    value={form.last_name}
                    onChange={(event) => setForm({ ...form, last_name: event.target.value })}
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1 text-sm font-medium">
                Datum narození
                <input
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
                  type="date"
                  value={form.date_of_birth}
                  onChange={(event) => setForm({ ...form, date_of_birth: event.target.value })}
                />
              </label>

              <label className="flex flex-col gap-1 text-sm font-medium">
                Bydliště
                <input
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
                  value={form.residence}
                  onChange={(event) => setForm({ ...form, residence: event.target.value })}
                />
              </label>

              <label className="flex flex-col gap-1 text-sm font-medium">
                Email
                <input
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                />
              </label>

              <button
                className="mt-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
                disabled={isSaving}
                type="submit"
              >
                {isSaving ? "Ukládám..." : isEditing ? "Uložit změny" : "Vytvořit hráče"}
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
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="px-6 py-3 font-semibold">Zobrazované jméno</th>
                      <th className="px-6 py-3 font-semibold">Jméno</th>
                      <th className="px-6 py-3 font-semibold">Příjmení</th>
                      <th className="px-6 py-3 font-semibold">Datum narození</th>
                      <th className="px-6 py-3 font-semibold">Bydliště</th>
                      <th className="px-6 py-3 font-semibold">Email</th>
                      <th className="px-6 py-3 font-semibold">Akce</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {players.map((player) => (
                      <tr key={player.id}>
                        <td className="px-6 py-4 font-medium">
                          {player.display_name}
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          {emptyText(player.first_name)}
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          {emptyText(player.last_name)}
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          {formatDate(player.date_of_birth)}
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          {emptyText(player.residence)}
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          {emptyText(player.email)}
                        </td>
                        <td className="px-6 py-4">
                          <button
                            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                            onClick={() => startEditing(player)}
                            type="button"
                          >
                            Upravit
                          </button>
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
