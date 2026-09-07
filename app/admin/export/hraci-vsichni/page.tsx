"use client";

import { adminFetch } from "@/lib/adminFetch";
import { Button, Card, PageHeader } from "@/components/ui/admin";
import { useState } from "react";

export default function AdminExportPlayersAllPage() {
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function downloadExport() {
    setIsDownloading(true);
    setError(null);

    const response = await adminFetch("/api/admin/export/players");

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Export hráčů se nepodařilo připravit.");
      setIsDownloading(false);
      return;
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    const disposition = response.headers.get("Content-Disposition") ?? "";
    const fileName = disposition.match(/filename="([^"]+)"/)?.[1] ?? "hraci-vsichni.csv";

    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    setIsDownloading(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description="CSV export všech nesmazaných hráčů. Pokud hráč nemá tým v aktuální sezóně, zůstane tým prázdný."
        title="Hráči - všichni"
      />

      <Card className="max-w-2xl">
        <h3 className="text-lg font-black text-[var(--brand-navy)]">Obsah exportu</h3>
        <p className="mt-3 text-sm font-semibold text-[var(--admin-muted)]">
          Soubor obsahuje sloupce: jméno, příjmení, tým, datum narození, bydliště a aktivní.
        </p>
        {error ? (
          <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
            {error}
          </div>
        ) : null}
        <div className="mt-6">
          <Button disabled={isDownloading} onClick={downloadExport}>
            {isDownloading ? "Připravuji export..." : "Stáhnout CSV"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
