"use client";

import { adminFetch } from "@/lib/adminFetch";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button, Card, PageHeader } from "@/components/ui/admin";

type AppRole = "player" | "moderator" | "admin";

type ManagedUser = {
  id: string;
  userId: string;
  email: string;
  playerId: string | null;
  displayName: string;
  appRole: AppRole;
  isActive: boolean;
  createdAt: string;
  teamNames: string[];
};

type Player = {
  id: string;
  display_name: string;
  email: string | null;
  teamNames: string[];
};

type UsersPayload = {
  users?: ManagedUser[];
  players?: Player[];
  error?: string;
};

const roleOptions: Array<{ value: AppRole; label: string }> = [
  { value: "player", label: "Standardní uživatel" },
  { value: "moderator", label: "Moderátor" },
  { value: "admin", label: "Administrátor" },
];

const inputClass =
  "min-h-11 rounded-2xl border border-[var(--admin-border)] bg-white px-4 py-3 text-sm font-semibold text-[var(--brand-navy)] outline-none focus:border-[var(--brand-blue)]";

function roleLabel(role: AppRole) {
  return roleOptions.find((option) => option.value === role)?.label ?? role;
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("cs-CZ")
    .trim();
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
    />
  );
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nameFilter, setNameFilter] = useState("");
  const [teamFilter, setTeamFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [form, setForm] = useState({
    email: "",
    display_name: "",
    player_id: "",
    app_role: "player" as AppRole,
  });
  const [drafts, setDrafts] = useState<Record<string, ManagedUser>>({});

  const playerById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);
  const selectedCreatePlayer = form.player_id ? playerById.get(form.player_id) : null;
  const teamOptions = useMemo(
    () =>
      Array.from(new Set(players.flatMap((player) => player.teamNames)))
        .sort((first, second) => first.localeCompare(second, "cs")),
    [players],
  );
  const visibleUsers = useMemo(() => {
    const normalizedNameFilter = normalizeSearch(nameFilter);

    return users.filter((user) => {
      const draft = drafts[user.id] ?? user;
      const player = draft.playerId ? playerById.get(draft.playerId) : null;
      const teamNames = player?.teamNames ?? user.teamNames ?? [];
      const searchableName = normalizeSearch([
        draft.displayName,
        user.email,
        player?.display_name,
        player?.email,
      ].filter(Boolean).join(" "));

      if (normalizedNameFilter && !searchableName.includes(normalizedNameFilter)) return false;
      if (teamFilter !== "all" && !teamNames.includes(teamFilter)) return false;
      if (roleFilter !== "all" && draft.appRole !== roleFilter) return false;

      return true;
    });
  }, [drafts, nameFilter, playerById, roleFilter, teamFilter, users]);

  async function loadUsers() {
    setIsLoading(true);
    setError(null);
    const response = await adminFetch("/api/admin/users");
    const body = (await response.json().catch(() => ({}))) as UsersPayload;

    if (!response.ok) {
      setError(body.error ?? "Uživatele se nepodařilo načíst.");
      setIsLoading(false);
      return;
    }

    setUsers(body.users ?? []);
    setPlayers(body.players ?? []);
    setDrafts(Object.fromEntries((body.users ?? []).map((user) => [user.id, user])));
    setIsLoading(false);
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadUsers();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const response = await adminFetch("/api/admin/users", {
      body: JSON.stringify(form),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const body = (await response.json().catch(() => ({}))) as { user?: ManagedUser; error?: string };

    if (!response.ok || !body.user) {
      setError(body.error ?? "Uživatele se nepodařilo vytvořit.");
      return;
    }

    const createdUser = { ...body.user!, teamNames: body.user!.teamNames ?? [] };
    setUsers((current) => [createdUser, ...current]);
    setDrafts((current) => ({ ...current, [createdUser.id]: createdUser }));
    setForm({ email: "", display_name: "", player_id: "", app_role: "player" });
    setIsCreateOpen(false);
    setMessage("Pozvánka byla odeslána.");
  }

  async function saveUser(userId: string) {
    const draft = drafts[userId];
    if (!draft) return;
    setError(null);
    setMessage(null);

    const response = await adminFetch(`/api/admin/users/${userId}`, {
      body: JSON.stringify({
        player_id: draft.playerId ?? "",
        display_name: draft.displayName,
        app_role: draft.appRole,
        is_active: draft.isActive,
      }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };

    if (!response.ok) {
      setError(body.error ?? "Uživatele se nepodařilo uložit.");
      return;
    }

    setUsers((current) => current.map((user) => (user.id === userId ? draft : user)));
    setMessage("Uživatel byl uložen.");
  }

  async function sendPasswordReset(userId: string) {
    setError(null);
    setMessage(null);
    setResettingUserId(userId);

    const response = await adminFetch(`/api/admin/users/${userId}`, {
      body: JSON.stringify({ action: "password_reset" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };

    setResettingUserId(null);

    if (!response.ok) {
      setError(body.error ?? "Obnovu hesla se nepodařilo odeslat.");
      return;
    }

    setMessage("Obnova hesla byla odeslána.");
  }

  async function deleteUser(user: ManagedUser) {
    if (!window.confirm(`Opravdu chcete smazat uživatele ${user.displayName || user.email}? Tato akce smaže i jeho přihlášení do webu.`)) {
      return;
    }

    setError(null);
    setMessage(null);
    setDeletingUserId(user.id);

    const response = await adminFetch(`/api/admin/users/${user.id}`, {
      method: "DELETE",
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };

    setDeletingUserId(null);

    if (!response.ok) {
      setError(body.error ?? "Uživatele se nepodařilo smazat.");
      return;
    }

    setUsers((current) => current.filter((item) => item.id !== user.id));
    setDrafts((current) => {
      const nextDrafts = { ...current };
      delete nextDrafts[user.id];
      return nextDrafts;
    });
    setMessage("Uživatel byl smazán.");
  }

  function updateDraft(userId: string, patch: Partial<ManagedUser>) {
    setDrafts((current) => ({ ...current, [userId]: { ...current[userId], ...patch } }));
  }

  return (
    <div>
      <PageHeader
        kicker="Administrace"
        title="Uživatelé"
        description="Správa Supabase Auth účtů, rolí a propojení s hráči."
        actions={
          <Button onClick={() => setIsCreateOpen((current) => !current)} variant="primary">
            Pozvat uživatele
          </Button>
        }
      />

      {message ? (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-black text-red-700">
          {error}
        </div>
      ) : null}

      {isCreateOpen ? (
        <Card className="mt-6">
          <form className="grid gap-4" onSubmit={handleCreate}>
            <div className="grid gap-4 lg:grid-cols-2">
              <label className="grid gap-2 text-sm font-bold">
                Email
                <input className={inputClass} onChange={(event) => setForm({ ...form, email: event.target.value })} type="email" value={form.email} />
              </label>
              <label className="grid gap-2 text-sm font-bold">
                Propojit s hráčem
                <select className={inputClass} onChange={(event) => setForm({ ...form, player_id: event.target.value, display_name: "" })} value={form.player_id}>
                  <option value="">Bez propojení</option>
                  {players.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.display_name}
                    </option>
                  ))}
                </select>
                {selectedCreatePlayer ? (
                  <span className="text-xs font-bold text-slate-500">
                    Zobrazované jméno bude použito z hráče: {selectedCreatePlayer.display_name}
                  </span>
                ) : null}
              </label>
              {!selectedCreatePlayer ? (
                <label className="grid gap-2 text-sm font-bold">
                  Zobrazované jméno
                  <input className={inputClass} onChange={(event) => setForm({ ...form, display_name: event.target.value })} value={form.display_name} />
                </label>
              ) : null}
              <label className="grid gap-2 text-sm font-bold">
                Role
                <select className={inputClass} onChange={(event) => setForm({ ...form, app_role: event.target.value as AppRole })} value={form.app_role}>
                  {roleOptions.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div>
              <Button type="submit" variant="primary">
                Odeslat pozvánku
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card className="mt-6">
        {isLoading ? <p className="text-sm text-[var(--admin-muted)]">Načítám uživatele...</p> : null}
        {!isLoading && users.length === 0 ? <p className="text-sm text-[var(--admin-muted)]">Zatím nejsou vytvoření žádní uživatelé.</p> : null}
        {!isLoading && users.length > 0 ? (
          <div className="grid gap-4 border-b border-[var(--admin-border)] bg-[var(--admin-soft-blue)] p-4 lg:grid-cols-[1fr_260px_220px]">
            <label className="grid gap-2 text-sm font-bold">
              Jméno
              <input
                className={inputClass}
                onChange={(event) => setNameFilter(event.target.value)}
                placeholder="Jméno nebo email"
                value={nameFilter}
              />
            </label>
            <label className="grid gap-2 text-sm font-bold">
              Tým
              <select className={inputClass} onChange={(event) => setTeamFilter(event.target.value)} value={teamFilter}>
                <option value="all">Všechny týmy</option>
                {teamOptions.map((teamName) => (
                  <option key={teamName} value={teamName}>
                    {teamName}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-bold">
              Funkce
              <select className={inputClass} onChange={(event) => setRoleFilter(event.target.value)} value={roleFilter}>
                <option value="all">Všechny funkce</option>
                {roleOptions.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
        {!isLoading && users.length > 0 && visibleUsers.length === 0 ? (
          <div className="p-4">
            <p className="rounded-2xl border border-[var(--admin-border)] bg-white px-4 py-3 text-sm font-bold text-[var(--admin-muted)]">
              Pro zvolené filtry nebyl nalezen žádný uživatel.
            </p>
          </div>
        ) : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="bg-[var(--admin-soft-blue)] text-[var(--admin-muted)]">
              <tr>
                <th className="px-4 py-3">Uživatel</th>
                <th className="px-4 py-3">Hráč</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Aktivní</th>
                <th className="px-4 py-3">Akce</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--admin-border)]">
              {visibleUsers.map((user) => {
                const draft = drafts[user.id] ?? user;
                const player = draft.playerId ? playerById.get(draft.playerId) : null;
                const isResetting = resettingUserId === user.id;
                const isDeleting = deletingUserId === user.id;
                return (
                  <tr key={user.id}>
                    <td className="px-4 py-4">
                      <input className={inputClass} onChange={(event) => updateDraft(user.id, { displayName: event.target.value })} value={draft.displayName} />
                      <p className="mt-1 text-xs font-bold text-slate-500">{user.email}</p>
                    </td>
                    <td className="px-4 py-4">
                      <select className={inputClass} onChange={(event) => updateDraft(user.id, { playerId: event.target.value || null })} value={draft.playerId ?? ""}>
                        <option value="">Bez propojení</option>
                        {players.map((player) => (
                          <option key={player.id} value={player.id}>
                            {player.display_name}
                          </option>
                        ))}
                      </select>
                      {draft.playerId ? (
                        <p className="mt-1 text-xs font-bold text-slate-500">
                          {[player?.email, ...(player?.teamNames ?? [])].filter(Boolean).join(" · ")}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-4">
                      <select className={inputClass} onChange={(event) => updateDraft(user.id, { appRole: event.target.value as AppRole })} value={draft.appRole}>
                        {roleOptions.map((role) => (
                          <option key={role.value} value={role.value}>
                            {role.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-4">
                      <label className="flex items-center gap-2 font-bold">
                        <input checked={draft.isActive} onChange={(event) => updateDraft(user.id, { isActive: event.target.checked })} type="checkbox" />
                        {draft.isActive ? "Aktivní" : "Deaktivovaný"}
                      </label>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-2">
                        <Button onClick={() => void saveUser(user.id)} variant="primary">
                          Uložit
                        </Button>
                        <Button disabled={isResetting} onClick={() => void sendPasswordReset(user.id)} variant="secondary">
                          <span className="inline-flex items-center gap-2">
                            {isResetting ? <Spinner /> : null}
                            {isResetting ? "Odesílám..." : "Odeslat obnovu hesla"}
                          </span>
                        </Button>
                        <Button disabled={isDeleting} onClick={() => void deleteUser(user)} variant="danger">
                          <span className="inline-flex items-center gap-2">
                            {isDeleting ? <Spinner /> : null}
                            {isDeleting ? "Mažu..." : "Smazat"}
                          </span>
                        </Button>
                      </div>
                      <p className="mt-2 text-xs font-bold text-slate-500">{roleLabel(user.appRole)}</p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
