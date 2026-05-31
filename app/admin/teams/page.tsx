"use client";

import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";

const mockRole = "admin";

type Team = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type TeamForm = {
  name: string;
};

const emptyForm: TeamForm = {
  name: "",
};

async function readJson(response: Response) {
  return (await response.json().catch(() => ({}))) as {
    error?: string;
    teams?: Team[];
    team?: Team;
  };
}

async function fetchTeams() {
  const response = await fetch("/api/admin/teams");
  const body = await readJson(response);

  if (!response.ok) {
    throw new Error(
      body.error?.includes("logo_url")
        ? "Nejprve spusťte SQL soubor supabase/apply_team_logos_in_dashboard.sql v Supabase SQL Editoru."
        : "Nepodařilo se načíst týmy.",
    );
  }

  return body.teams ?? [];
}

export default function AdminTeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [form, setForm] = useState<TeamForm>(emptyForm);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [busyTeamId, setBusyTeamId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canManageTeams = mockRole === "admin";

  async function loadTeams(showLoading = true) {
    if (showLoading) {
      setIsLoading(true);
    }

    setError(null);

    try {
      setTeams(await fetchTeams());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Nepodařilo se načíst týmy.");
      setTeams([]);
    }

    setIsLoading(false);
  }

  useEffect(() => {
    let isMounted = true;

    fetchTeams()
      .then((loadedTeams) => {
        if (!isMounted) {
          return;
        }

        setTeams(loadedTeams);
        setIsLoading(false);
      })
      .catch((loadError) => {
        if (!isMounted) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : "Nepodařilo se načíst týmy.");
        setTeams([]);
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManageTeams || !form.name.trim()) {
      return;
    }

    setIsSaving(true);
    setError(null);

    const response = await fetch("/api/admin/teams", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: form.name.trim(),
      }),
    });

    await readJson(response);

    if (!response.ok) {
      setError("Nepodařilo se vytvořit tým.");
    } else {
      setForm(emptyForm);
      await loadTeams();
    }

    setIsSaving(false);
  }

  async function handleUpdate(teamId: string) {
    if (!editingName.trim()) {
      return;
    }

    setBusyTeamId(teamId);
    setError(null);

    const response = await fetch(`/api/admin/teams/${teamId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: editingName.trim(),
      }),
    });

    await readJson(response);

    if (!response.ok) {
      setError("Nepodařilo se upravit tým.");
    } else {
      setEditingTeamId(null);
      setEditingName("");
      await loadTeams(false);
    }

    setBusyTeamId(null);
  }

  async function handleDelete(teamId: string) {
    setBusyTeamId(teamId);
    setError(null);

    const response = await fetch(`/api/admin/teams/${teamId}`, {
      method: "DELETE",
    });

    await readJson(response);

    if (!response.ok) {
      setError("Nepodařilo se odstranit tým.");
    } else {
      await loadTeams(false);
    }

    setBusyTeamId(null);
  }

  async function handleLogoUpload(teamId: string, logo: File | undefined) {
    if (!logo) {
      return;
    }

    setBusyTeamId(teamId);
    setError(null);

    const formData = new FormData();
    formData.set("logo", logo);
    const response = await fetch(`/api/admin/teams/${teamId}/logo`, {
      method: "POST",
      body: formData,
    });
    const body = await readJson(response);

    if (!response.ok) {
      setError(body.error ?? "Nepodařilo se nahrát logo týmu.");
    } else {
      await loadTeams(false);
    }

    setBusyTeamId(null);
  }

  function startEditing(team: Team) {
    setEditingTeamId(team.id);
    setEditingName(team.name);
  }

  function cancelEditing() {
    setEditingTeamId(null);
    setEditingName("");
  }

  return (
    <div className="flex flex-col gap-8">
        <header>
          <p className="text-sm font-medium text-slate-500">Administrace</p>
          <h2 className="mt-2 text-3xl font-bold">Týmy</h2>
        </header>

        {!canManageTeams ? (
          <section className="rounded-lg bg-white p-6 shadow-sm">
            <p className="text-sm text-slate-600">
              Aktuální testovací role neumožňuje správu týmů.
            </p>
          </section>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
            <section className="rounded-lg bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold">Vytvořit tým</h3>

              <form className="mt-5 flex flex-col gap-4" onSubmit={handleCreate}>
                <label className="flex flex-col gap-1 text-sm font-medium">
                  Název týmu
                  <input
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
                    required
                    value={form.name}
                    onChange={(event) =>
                      setForm({ ...form, name: event.target.value })
                    }
                  />
                </label>

                <button
                  className="mt-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
                  disabled={isSaving}
                  type="submit"
                >
                  {isSaving ? "Ukládám..." : "Vytvořit tým"}
                </button>
                <p className="text-xs text-slate-500">
                  Logo lze nahrát po vytvoření týmu v seznamu.
                </p>
              </form>
            </section>

            <section className="rounded-lg bg-white shadow-sm">
              <div className="border-b border-slate-200 px-6 py-4">
                <h3 className="text-lg font-semibold">Seznam týmů</h3>
              </div>

              {error ? (
                <div className="px-6 py-5 text-sm text-red-700">{error}</div>
              ) : null}

              {isLoading ? (
                <div className="px-6 py-5 text-sm text-slate-500">
                  Načítám týmy...
                </div>
              ) : teams.length === 0 ? (
                <div className="px-6 py-5 text-sm text-slate-500">
                  Nebyly nalezeny žádné týmy.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-6 py-3 font-semibold">Logo</th>
                        <th className="px-6 py-3 font-semibold">Název</th>
                        <th className="px-6 py-3 font-semibold">URL název</th>
                        <th className="px-6 py-3 font-semibold">Vytvořeno</th>
                        <th className="px-6 py-3 font-semibold">Akce</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {teams.map((team) => {
                        const isEditing = editingTeamId === team.id;
                        const isBusy = busyTeamId === team.id;

                        return (
                          <tr key={team.id}>
                            <td className="px-6 py-4">
                              <div className="flex min-w-28 items-center gap-3">
                                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white p-1">
                                  {team.logo_url ? (
                                    <Image
                                      alt={`Logo ${team.name}`}
                                      className="h-full w-full object-contain"
                                      height={56}
                                      src={team.logo_url}
                                      unoptimized
                                      width={56}
                                    />
                                  ) : (
                                    <span className="text-lg font-bold text-slate-500">
                                      {team.name.charAt(0)}
                                    </span>
                                  )}
                                </div>
                                <label className={`cursor-pointer rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 ${isBusy ? "pointer-events-none opacity-60" : ""}`}>
                                  {team.logo_url ? "Změnit logo" : "Nahrát logo"}
                                  <input
                                    accept="image/jpeg,image/png,image/webp"
                                    className="hidden"
                                    disabled={isBusy}
                                    onChange={(event) => {
                                      void handleLogoUpload(team.id, event.target.files?.[0]);
                                      event.target.value = "";
                                    }}
                                    type="file"
                                  />
                                </label>
                              </div>
                            </td>
                            <td className="px-6 py-4 font-medium">
                              {isEditing ? (
                                <input
                                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
                                  value={editingName}
                                  onChange={(event) => setEditingName(event.target.value)}
                                />
                              ) : (
                                team.name
                              )}
                            </td>
                            <td className="px-6 py-4 text-slate-600">{team.slug}</td>
                            <td className="px-6 py-4 text-slate-600">
                              {new Date(team.created_at).toLocaleDateString()}
                            </td>
                            <td className="px-6 py-4">
                              {isEditing ? (
                                <div className="flex gap-2">
                                  <button
                                    className="rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
                                    disabled={isBusy}
                                    onClick={() => handleUpdate(team.id)}
                                    type="button"
                                  >
                                    Uložit
                                  </button>
                                  <button
                                    className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"
                                    disabled={isBusy}
                                    onClick={cancelEditing}
                                    type="button"
                                  >
                                    Zrušit
                                  </button>
                                </div>
                              ) : (
                                <div className="flex gap-2">
                                  <button
                                    className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:text-slate-400"
                                    disabled={isBusy}
                                    onClick={() => startEditing(team)}
                                    type="button"
                                  >
                                    Upravit
                                  </button>
                                  <button
                                    className="rounded-md border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 disabled:cursor-not-allowed disabled:text-red-300"
                                    disabled={isBusy}
                                    onClick={() => handleDelete(team.id)}
                                    type="button"
                                  >
                                    Odstranit
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
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
