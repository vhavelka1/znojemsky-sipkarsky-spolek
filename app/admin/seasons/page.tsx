"use client";

import { adminFetch } from "@/lib/adminFetch";
import { FormEvent, useEffect, useMemo, useState } from "react";

const mockRole = "admin";

type Season = {
  id: string;
  name: string;
  starts_on: string;
  ends_on: string;
  transfer_deadline_on: string;
  transfer_wait_days: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type SeasonForm = {
  name: string;
  starts_on: string;
  ends_on: string;
  transfer_deadline_on: string;
  transfer_wait_days: string;
  is_active: boolean;
};

const emptyForm: SeasonForm = {
  name: "",
  starts_on: "",
  ends_on: "",
  transfer_deadline_on: "",
  transfer_wait_days: "14",
  is_active: false,
};

async function readJson(response: Response) {
  return (await response.json().catch(() => ({}))) as {
    error?: string;
    seasons?: Season[];
    season?: Season;
  };
}

async function fetchSeasons() {
  const response = await adminFetch("/api/admin/seasons");
  const body = await readJson(response);

  if (!response.ok) {
    throw new Error("Nepodařilo se načíst sezóny.");
  }

  return body.seasons ?? [];
}

function formFromSeason(season: Season): SeasonForm {
  return {
    name: season.name,
    starts_on: season.starts_on,
    ends_on: season.ends_on,
    transfer_deadline_on: season.transfer_deadline_on,
    transfer_wait_days: String(season.transfer_wait_days),
    is_active: season.is_active,
  };
}

export default function AdminSeasonsPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [form, setForm] = useState<SeasonForm>(emptyForm);
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
  const [seasonFilter, setSeasonFilter] = useState("");
  const [seasonStatusFilter, setSeasonStatusFilter] = useState("");
  const [editingSeasonId, setEditingSeasonId] = useState<string | null>(null);
  const [editingForm, setEditingForm] = useState<SeasonForm>(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [busySeasonId, setBusySeasonId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canManageSeasons = mockRole === "admin";
  const filteredSeasons = useMemo(
    () =>
      seasons.filter((season) => {
        if (seasonFilter.trim()) {
          const filter = seasonFilter.trim().toLocaleLowerCase("cs-CZ");
          if (!season.name.toLocaleLowerCase("cs-CZ").includes(filter)) {
            return false;
          }
        }

        if (seasonStatusFilter === "active" && !season.is_active) {
          return false;
        }

        if (seasonStatusFilter === "inactive" && season.is_active) {
          return false;
        }

        return true;
      }),
    [seasonFilter, seasonStatusFilter, seasons],
  );

  async function loadSeasons(showLoading = true) {
    if (showLoading) {
      setIsLoading(true);
    }

    setError(null);

    try {
      setSeasons(await fetchSeasons());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Nepodařilo se načíst sezóny.");
      setSeasons([]);
    }

    setIsLoading(false);
  }

  useEffect(() => {
    let isMounted = true;

    fetchSeasons()
      .then((loadedSeasons) => {
        if (!isMounted) {
          return;
        }

        setSeasons(loadedSeasons);
        setIsLoading(false);
      })
      .catch((loadError) => {
        if (!isMounted) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : "Nepodařilo se načíst sezóny.");
        setSeasons([]);
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  async function submitSeason(url: string, method: "POST" | "PATCH", seasonForm: SeasonForm) {
    const response = await adminFetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: seasonForm.name.trim(),
        starts_on: seasonForm.starts_on,
        ends_on: seasonForm.ends_on,
        transfer_deadline_on: seasonForm.transfer_deadline_on,
        transfer_wait_days: seasonForm.transfer_wait_days,
        is_active: seasonForm.is_active,
      }),
    });

    await readJson(response);

    if (!response.ok) {
      throw new Error("Nepodařilo se uložit sezónu.");
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManageSeasons || !form.name.trim()) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await submitSeason("/api/admin/seasons", "POST", form);
      setForm(emptyForm);
      setIsCreateFormOpen(false);
      await loadSeasons();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Nepodařilo se vytvořit sezónu.");
    }

    setIsSaving(false);
  }

  async function handleUpdate(seasonId: string) {
    if (!editingForm.name.trim()) {
      return;
    }

    setBusySeasonId(seasonId);
    setError(null);

    try {
      await submitSeason(`/api/admin/seasons/${seasonId}`, "PATCH", editingForm);
      setEditingSeasonId(null);
      setEditingForm(emptyForm);
      await loadSeasons(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Nepodařilo se upravit sezónu.");
    }

    setBusySeasonId(null);
  }

  async function handleActivate(seasonId: string) {
    setBusySeasonId(seasonId);
    setError(null);

    const response = await adminFetch(`/api/admin/seasons/${seasonId}/activate`, {
      method: "POST",
    });
    await readJson(response);

    if (!response.ok) {
      setError("Nepodařilo se označit sezónu jako aktivní.");
    } else {
      await loadSeasons(false);
    }

    setBusySeasonId(null);
  }

  async function handleDelete(seasonId: string) {
    setBusySeasonId(seasonId);
    setError(null);

    const response = await adminFetch(`/api/admin/seasons/${seasonId}`, {
      method: "DELETE",
    });
    await readJson(response);

    if (!response.ok) {
      setError("Nepodařilo se odstranit sezónu.");
    } else {
      await loadSeasons(false);
    }

    setBusySeasonId(null);
  }

  function startEditing(season: Season) {
    setEditingSeasonId(season.id);
    setEditingForm(formFromSeason(season));
  }

  function cancelEditing() {
    setEditingSeasonId(null);
    setEditingForm(emptyForm);
  }

  function renderSeasonFields(
    seasonForm: SeasonForm,
    setSeasonForm: (nextForm: SeasonForm) => void,
    includeActiveToggle: boolean,
  ) {
    return (
      <>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Název
          <input
            className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
            required
            value={seasonForm.name}
            onChange={(event) => setSeasonForm({ ...seasonForm, name: event.target.value })}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Začátek
          <input
            className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
            required
            type="date"
            value={seasonForm.starts_on}
            onChange={(event) =>
              setSeasonForm({ ...seasonForm, starts_on: event.target.value })
            }
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Konec
          <input
            className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
            required
            type="date"
            value={seasonForm.ends_on}
            onChange={(event) =>
              setSeasonForm({ ...seasonForm, ends_on: event.target.value })
            }
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Uzávěrka přestupů
          <input
            className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
            required
            type="date"
            value={seasonForm.transfer_deadline_on}
            onChange={(event) =>
              setSeasonForm({
                ...seasonForm,
                transfer_deadline_on: event.target.value,
              })
            }
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Čekací doba přestupu
          <input
            className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
            min="0"
            required
            type="number"
            value={seasonForm.transfer_wait_days}
            onChange={(event) =>
              setSeasonForm({
                ...seasonForm,
                transfer_wait_days: event.target.value,
              })
            }
          />
        </label>

        {includeActiveToggle ? (
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              checked={seasonForm.is_active}
              className="h-4 w-4 rounded border-slate-300"
              onChange={(event) =>
                setSeasonForm({ ...seasonForm, is_active: event.target.checked })
              }
              type="checkbox"
            />
            Označit jako aktivní
          </label>
        ) : null}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-8">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Administrace</p>
            <h2 className="mt-2 text-3xl font-bold">Sezóny</h2>
          </div>
          {canManageSeasons ? (
            <button
              className="rounded-xl bg-[#EF233C] px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#C91D32]"
              onClick={() => setIsCreateFormOpen(true)}
              type="button"
            >
              Vytvořit sezónu
            </button>
          ) : null}
        </header>

        {!canManageSeasons ? (
          <section className="rounded-lg bg-white p-6 shadow-sm">
            <p className="text-sm text-slate-600">
              Aktuální testovací role neumožňuje správu sezón.
            </p>
          </section>
        ) : (
          <>
            <section className="rounded-lg bg-white p-6 shadow-sm">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm font-medium">
                  Hledat sezónu
                  <input
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
                    placeholder="Název sezóny"
                    value={seasonFilter}
                    onChange={(event) => setSeasonFilter(event.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium">
                  Stav
                  <select
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
                    value={seasonStatusFilter}
                    onChange={(event) => setSeasonStatusFilter(event.target.value)}
                  >
                    <option value="">Všechny stavy</option>
                    <option value="active">Aktivní</option>
                    <option value="inactive">Neaktivní</option>
                  </select>
                </label>
              </div>
            </section>

          {isCreateFormOpen ? (
            <section className="rounded-lg bg-white p-6 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold">Vytvořit sezónu</h3>
                      <p className="mt-1 text-sm text-slate-500">
                        Nastavte termíny, přestupy a případně aktivní sezónu.
                      </p>
                    </div>
                    <button
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      onClick={() => {
                        setForm(emptyForm);
                        setIsCreateFormOpen(false);
                      }}
                      type="button"
                    >
                      Zrušit
                    </button>
                  </div>

                  <form className="mt-5 flex flex-col gap-4" onSubmit={handleCreate}>
                    {renderSeasonFields(form, setForm, true)}

                    <button
                      className="mt-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
                      disabled={isSaving}
                      type="submit"
                    >
                      {isSaving ? "Ukládám..." : "Uložit sezónu"}
                    </button>
                  </form>
            </section>
          ) : null}

            <section className="rounded-lg bg-white shadow-sm">
              <div className="border-b border-slate-200 px-6 py-4">
                <h3 className="text-lg font-semibold">Seznam sezón</h3>
              </div>

              {error ? (
                <div className="px-6 py-5 text-sm text-red-700">{error}</div>
              ) : null}

              {isLoading ? (
                <div className="px-6 py-5 text-sm text-slate-500">
                  Načítám sezóny...
                </div>
              ) : seasons.length === 0 ? (
                <div className="px-6 py-5 text-sm text-slate-500">
                  Nebyly nalezeny žádné sezóny.
                </div>
              ) : filteredSeasons.length === 0 ? (
                <div className="px-6 py-5 text-sm text-slate-500">
                  Pro zvolený filtr nebyla nalezena žádná sezóna.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-6 py-3 font-semibold">Sezóna</th>
                        <th className="px-6 py-3 font-semibold">Termíny</th>
                        <th className="px-6 py-3 font-semibold">Uzávěrka přestupů</th>
                        <th className="px-6 py-3 font-semibold">Stav</th>
                        <th className="px-6 py-3 font-semibold">Akce</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredSeasons.map((season) => {
                        const isEditing = editingSeasonId === season.id;
                        const isBusy = busySeasonId === season.id;

                        return (
                          <tr key={season.id}>
                            <td className="px-6 py-4 align-top font-medium">
                              {isEditing ? (
                                <div className="flex min-w-56 flex-col gap-3">
                                  {renderSeasonFields(editingForm, setEditingForm, false)}
                                </div>
                              ) : (
                                season.name
                              )}
                            </td>
                            <td className="px-6 py-4 align-top text-slate-600">
                              {season.starts_on} až {season.ends_on}
                            </td>
                            <td className="px-6 py-4 align-top text-slate-600">
                              {season.transfer_deadline_on}
                              <div className="mt-1 text-xs text-slate-500">
                                Čekací doba {season.transfer_wait_days} dnů
                              </div>
                            </td>
                            <td className="px-6 py-4 align-top">
                              <span
                                className={
                                  season.is_active
                                    ? "rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
                                    : "rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600"
                                }
                              >
                                {season.is_active ? "Aktivní" : "Neaktivní"}
                              </span>
                            </td>
                            <td className="px-6 py-4 align-top">
                              {isEditing ? (
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    className="rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
                                    disabled={isBusy}
                                    onClick={() => handleUpdate(season.id)}
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
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:text-slate-400"
                                    disabled={isBusy}
                                    onClick={() => startEditing(season)}
                                    type="button"
                                  >
                                    Upravit
                                  </button>
                                  <button
                                    className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:text-slate-400"
                                    disabled={isBusy || season.is_active}
                                    onClick={() => handleActivate(season.id)}
                                    type="button"
                                  >
                                    Označit aktivní
                                  </button>
                                  <button
                                    className="rounded-md border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 disabled:cursor-not-allowed disabled:text-red-300"
                                    disabled={isBusy}
                                    onClick={() => handleDelete(season.id)}
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
          </>
        )}
    </div>
  );
}
