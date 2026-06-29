"use client";

import { adminFetch } from "@/lib/adminFetch";
import { FormEvent, useEffect, useState } from "react";
import { Button, Card, PageHeader } from "@/components/ui/admin";

type HomepageSettings = {
  homepageKicker: string;
  homepageTitle: string;
  homepageSubtitle: string;
  teamRegistrationIntro: string;
  competitionRulesFileName: string;
  competitionRulesFileUrl: string;
  competitionRulesStoragePath: string;
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
  teamRegistrationIntro:
    "Formulář pro registraci týmu do Znojemské šipkařské týmové ligy pro sezonu 2026/2027.\n\nRegistrační poplatek na sezonu je stanoven na 1500 Kč. Uhrazení proběhne na účet Znojemského šipkařského spolku. Do poznámky pro příjemce uvést název týmu.\nČ. účtu: 246898551\nKód banky: 0/600\n\nTermín odevzdání přihlášek je stanoven na 31. 7. 2026",
  competitionRulesFileName: "",
  competitionRulesFileUrl: "",
  competitionRulesStoragePath: "",
};

const inputClass =
  "rounded-2xl border border-[var(--admin-border)] bg-white px-4 py-3 text-sm text-[var(--brand-navy)] outline-none focus:border-[var(--brand-blue)]";

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<HomepageSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingRules, setIsUploadingRules] = useState(false);
  const [rulesFile, setRulesFile] = useState<File | null>(null);
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

  async function handleRulesUpload() {
    if (!rulesFile) {
      setError("Vyberte soubor pravidel soutěže.");
      setMessage(null);
      return;
    }

    setIsUploadingRules(true);
    setMessage(null);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("rules_file", rulesFile);
      const response = await adminFetch("/api/admin/settings", {
        method: "POST",
        body: formData,
      });
      const body = (await response.json().catch(() => ({}))) as SettingsResponse;
      if (!response.ok) {
        throw new Error(body.error ?? "Soubor pravidel se nepodařilo uložit.");
      }

      setSettings(body.settings ?? settings);
      setRulesFile(null);
      setMessage(body.notice ?? "Soubor pravidel soutěže byl uložen.");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Soubor pravidel se nepodařilo uložit.");
    }

    setIsUploadingRules(false);
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

          <label className="grid gap-2 text-sm font-black text-[var(--brand-navy)]">
            Text u registrace týmu
            <textarea
              className={`${inputClass} min-h-56 resize-y whitespace-pre-wrap`}
              disabled={isLoading || isSaving}
              maxLength={3000}
              onChange={(event) =>
                updateField("teamRegistrationIntro", event.target.value)
              }
              value={settings.teamRegistrationIntro}
            />
          </label>

          <div className="rounded-3xl border border-[var(--admin-border)] bg-[#F4F8FF] p-5">
            <h3 className="text-lg font-black text-[var(--brand-navy)]">Pravidla soutěže</h3>
            <p className="mt-2 text-sm text-[var(--admin-muted)]">
              Soubor se zobrazí jako odkaz ve formuláři registrace týmu i jednotlivce.
            </p>
            {settings.competitionRulesFileUrl ? (
              <a
                className="mt-4 inline-flex text-sm font-black text-[var(--brand-blue)] hover:text-[var(--brand-red)]"
                href={settings.competitionRulesFileUrl}
                rel="noreferrer"
                target="_blank"
              >
                {settings.competitionRulesFileName || "Zobrazit aktuální pravidla"}
              </a>
            ) : (
              <p className="mt-4 text-sm font-bold text-[var(--admin-muted)]">Soubor pravidel zatím není nahraný.</p>
            )}
            <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
              <input
                accept=".pdf,.doc,.docx,.odt,.rtf,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className={inputClass}
                disabled={isLoading || isSaving || isUploadingRules}
                onChange={(event) => setRulesFile(event.target.files?.[0] ?? null)}
                type="file"
              />
              <Button
                disabled={isLoading || isSaving || isUploadingRules || !rulesFile}
                onClick={handleRulesUpload}
                type="button"
              >
                {isUploadingRules ? "Nahrávám..." : settings.competitionRulesFileUrl ? "Změnit pravidla" : "Nahrát pravidla"}
              </Button>
            </div>
          </div>

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
