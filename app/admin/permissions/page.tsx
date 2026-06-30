"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { adminRoleLabels, type AdminRole } from "@/lib/adminPages";
import { Button, Card, PageHeader } from "@/components/ui/admin";

type Permission = {
  key: string;
  href: string;
  label: string;
  defaultMinimumRole: AdminRole;
  minimumRole: AdminRole;
};

type PermissionsPayload = {
  permissions?: Permission[];
  error?: string;
};

const roleOptions: AdminRole[] = ["player", "moderator", "admin"];

const roleDescriptions: Record<AdminRole, string> = {
  player: "Přístup mají standardní uživatelé, moderátoři a administrátoři.",
  moderator: "Přístup mají moderátoři a administrátoři.",
  admin: "Přístup mají pouze administrátoři.",
};

const selectClass =
  "min-h-11 rounded-2xl border border-[var(--admin-border)] bg-white px-4 py-3 text-sm font-semibold text-[var(--brand-navy)] outline-none focus:border-[var(--brand-blue)]";

export default function AdminPermissionsPage() {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadPermissions() {
    setIsLoading(true);
    setError(null);
    const response = await adminFetch("/api/admin/permissions");
    const body = (await response.json().catch(() => ({}))) as PermissionsPayload;

    if (!response.ok) {
      setError(body.error ?? "Práva se nepodařilo načíst.");
      setIsLoading(false);
      return;
    }

    setPermissions(body.permissions ?? []);
    setIsLoading(false);
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadPermissions();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  function updatePermission(key: string, minimumRole: AdminRole) {
    setPermissions((current) =>
      current.map((permission) =>
        permission.key === key ? { ...permission, minimumRole } : permission,
      ),
    );
  }

  async function savePermissions() {
    setIsSaving(true);
    setError(null);
    setMessage(null);

    const response = await adminFetch("/api/admin/permissions", {
      body: JSON.stringify({
        permissions: permissions.map((permission) => ({
          key: permission.key,
          minimumRole: permission.minimumRole,
        })),
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "PUT",
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };

    if (!response.ok) {
      setError(body.error ?? "Práva se nepodařilo uložit.");
      setIsSaving(false);
      return;
    }

    setMessage("Práva byla uložena.");
    setIsSaving(false);
  }

  return (
    <div>
      <PageHeader
        description="Nastavte minimální oprávnění, které je potřeba pro zobrazení jednotlivých stránek v administraci."
        title="Práva"
        actions={
          <Button disabled={isSaving || isLoading} onClick={() => void savePermissions()} variant="primary">
            {isSaving ? "Ukládám..." : "Uložit práva"}
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

      <Card className="mt-6">
        {isLoading ? <p className="text-sm text-[var(--admin-muted)]">Načítám práva...</p> : null}
        {!isLoading && permissions.length === 0 ? (
          <p className="text-sm text-[var(--admin-muted)]">Zatím nejsou nastavena žádná práva.</p>
        ) : null}

        {permissions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-sm">
              <thead className="bg-[var(--admin-soft-blue)] text-[var(--admin-muted)]">
                <tr>
                  <th className="px-4 py-3">Stránka</th>
                  <th className="px-4 py-3">Adresa</th>
                  <th className="px-4 py-3">Minimální role</th>
                  <th className="px-4 py-3">Význam</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--admin-border)]">
                {permissions.map((permission) => (
                  <tr key={permission.key}>
                    <td className="px-4 py-4">
                      <p className="font-black text-[var(--brand-navy)]">{permission.label}</p>
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        Výchozí role: {adminRoleLabels[permission.defaultMinimumRole]}
                      </p>
                    </td>
                    <td className="px-4 py-4 font-mono text-xs text-slate-600">{permission.href}</td>
                    <td className="px-4 py-4">
                      <select
                        className={selectClass}
                        onChange={(event) => updatePermission(permission.key, event.target.value as AdminRole)}
                        value={permission.minimumRole}
                      >
                        {roleOptions.map((role) => (
                          <option key={role} value={role}>
                            {adminRoleLabels[role]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-4 text-sm font-semibold text-slate-600">
                      {roleDescriptions[permission.minimumRole]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
