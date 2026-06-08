"use client";

import { adminFetch } from "@/lib/adminFetch";
import { FormEvent, useEffect, useState } from "react";
import { Button, Card, PageHeader } from "@/components/ui/admin";

type HomepageSettings = {
  homepageKicker: string;
  homepageTitle: string;
  homepageSubtitle: string;
};

type SettingsResponse = {
  settings?: HomepageSettings;
  error?: string;
  notice?: string;
};

const defaultSettings: HomepageSettings = {
  homepageKicker: "Regionální šipková liga",
  homepageTitle: "Znojemský šipkařský spolek",
  homepageSubtitle: "Oficiální systém lig, turnajů a statistik.",
};

const inputClass =
  "rounded-2xl border border-[var(--admin-border)] bg-white px-4 py-3 text-sm text-[var(--brand-navy)] outline-none focus:border-[var(--brand-blue)]";

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<HomepageSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    adminFetch("/api/admin/settings")
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as SettingsResponse;
        if (!response.ok) {
          throw new Error(body.error ?? "Nastavení se nepodařilo načíst.");
        }
        return body;
      })
      .then((body) => {
        if (!isMounted) return;
        setSettings(body.settings ?? defaultSettings);
        setError(body.error ?? null);
        setMessage(body.notice ?? null);
        setIsLoading(false);
      })
      .catch((loadError) => {
        if (!isMounted) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Nastavení se nepodařilo načíst.",
        );
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  function updateField(field: keyof HomepageSettings, value: string) {
    setMessage(null);
    setError(null);
    setSettings((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage(null);
    setError(null);

    try {
      const response = await adminFetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const body = (await response.json().catch(() => ({}))) as SettingsResponse;
      if (!response.ok) {
        throw new Error(body.error ?? "Nastavení se nepodařilo uložit.");
      }
      setSettings(body.settings ?? settings);
      setMessage(body.notice ?? "Nastavení úvodní stránky bylo uloženo.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Nastavení se nepodařilo uložit.",
      );
    }

    setIsSaving(false);
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        description="Upravte hlavní texty, které se zobrazují v úvodním hero bloku veřejné stránky."
        title="Nastavení"
      />

      {error ? (
        <Card>
          <p className="text-sm font-semibold text-red-700">{error}</p>
        </Card>
      ) : null}

      {message ? (
        <Card>
          <p className="text-sm font-semibold text-emerald-700">{message}</p>
        </Card>
      ) : null}

      <Card>
        <form className="grid gap-5" onSubmit={handleSubmit}>
          <div>
            <h3 className="text-xl font-black text-[var(--brand-navy)]">
              Úvodní stránka
            </h3>
            <p className="mt-2 text-sm text-[var(--admin-muted)]">
              Tyto texty se použijí v horní části veřejného webu.
            </p>
          </div>

          <label className="grid gap-2 text-sm font-black text-[var(--brand-navy)]">
            Malý nadpis
            <input
              className={inputClass}
              disabled={isLoading || isSaving}
              maxLength={180}
              onChange={(event) => updateField("homepageKicker", event.target.value)}
              type="text"
              value={settings.homepageKicker}
            />
          </label>

          <label className="grid gap-2 text-sm font-black text-[var(--brand-navy)]">
            Hlavní nadpis
            <input
              className={inputClass}
              disabled={isLoading || isSaving}
              maxLength={180}
              onChange={(event) => updateField("homepageTitle", event.target.value)}
              type="text"
              value={settings.homepageTitle}
            />
          </label>

          <label className="grid gap-2 text-sm font-black text-[var(--brand-navy)]">
            Podnadpis
            <textarea
              className={`${inputClass} min-h-28 resize-y`}
              disabled={isLoading || isSaving}
              maxLength={180}
              onChange={(event) =>
                updateField("homepageSubtitle", event.target.value)
              }
              value={settings.homepageSubtitle}
            />
          </label>

          <div className="flex flex-wrap gap-3">
            <Button disabled={isLoading || isSaving} type="submit">
              {isSaving ? "Ukládám..." : "Uložit nastavení"}
            </Button>
            <Button
              disabled={isLoading || isSaving}
              onClick={() => {
                setSettings(defaultSettings);
                setMessage(null);
                setError(null);
              }}
              type="button"
              variant="secondary"
            >
              Obnovit výchozí texty
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
