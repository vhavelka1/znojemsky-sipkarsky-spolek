"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card, PageHeader } from "@/components/ui/admin";
import { adminFetch } from "@/lib/adminFetch";
import type { TournamentRequest, TournamentRequestStatus } from "@/lib/tournamentRequests";

type Payload = {
  requests?: TournamentRequest[];
  error?: string;
};

const statusLabels: Record<TournamentRequestStatus, string> = {
  pending: "Čeká na schválení",
  approved: "Schváleno",
  rejected: "Zamítnuto",
  cancelled: "Zrušeno",
};

function statusClass(status: TournamentRequestStatus) {
  if (status === "approved") return "rounded-full bg-green-100 px-3 py-1 text-xs font-black text-green-800";
  if (status === "rejected") return "rounded-full bg-red-100 px-3 py-1 text-xs font-black text-red-800";
  if (status === "cancelled") return "rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700";
  return "admin-badge";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("cs-CZ", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatPlainDate(value: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("cs-CZ", { dateStyle: "medium" }).format(new Date(`${value}T00:00:00`));
}

function tournamentTypeLabel(type: TournamentRequest["tournament_type"]) {
  return type === "major" ? "Major turnaj" : "Mini turnaj";
}

export default function AdminTournamentRequestsPage() {
  const [requests, setRequests] = useState<TournamentRequest[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedRequest = useMemo(
    () => requests.find((request) => request.id === selectedRequestId) ?? requests[0] ?? null,
    [requests, selectedRequestId],
  );

  async function loadRequests() {
    setIsLoading(true);
    setError(null);

    const response = await adminFetch("/api/admin/tournament-requests", { cache: "no-store" });
    const body = (await response.json().catch(() => ({}))) as Payload;

    if (!response.ok) {
      setError(body.error ?? "Žádosti turnajů se nepodařilo načíst.");
      setIsLoading(false);
      return;
    }

    setRequests(body.requests ?? []);
    setIsLoading(false);
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadRequests();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  async function reviewRequest(id: string, action: "approve" | "reject" | "return" | "cancel") {
    setProcessingId(id);
    setError(null);
    setMessage(null);

    const response = await adminFetch("/api/admin/tournament-requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        action,
        admin_note: notes[id] ?? selectedRequest?.admin_note ?? "",
      }),
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };

    setProcessingId(null);

    if (!response.ok) {
      setError(body.error ?? "Žádost turnaje se nepodařilo zpracovat.");
      return;
    }

    setMessage("Žádost turnaje byla uložena.");
    await loadRequests();
  }

  async function deleteRequest(id: string) {
    if (!window.confirm("Opravdu chcete žádost odstranit?")) return;

    setProcessingId(id);
    setError(null);
    setMessage(null);

    const response = await adminFetch(`/api/admin/tournament-requests?id=${id}`, { method: "DELETE" });
    const body = (await response.json().catch(() => ({}))) as { error?: string };

    setProcessingId(null);

    if (!response.ok) {
      setError(body.error ?? "Žádost turnaje se nepodařilo odstranit.");
      return;
    }

    setSelectedRequestId(null);
    setMessage("Žádost turnaje byla odstraněna.");
    await loadRequests();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        description="Schvalování žádostí pořadatelů o major a mini turnaje vytvořených z veřejné stránky Turnaje."
        title="Žádosti turnajů"
      />

      {message ? <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-800">{message}</div> : null}
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)]">
        <Card className="p-0">
          <div className="border-b border-[var(--admin-border)] px-5 py-4">
            <h2 className="text-lg font-black text-[var(--brand-navy)]">Žádosti</h2>
          </div>
          {isLoading ? (
            <p className="p-5 text-sm font-bold text-[var(--admin-muted)]">Načítám žádosti...</p>
          ) : requests.length === 0 ? (
            <p className="p-5 text-sm font-bold text-[var(--admin-muted)]">Zatím nejsou evidované žádné turnajové žádosti.</p>
          ) : (
            <div className="divide-y divide-[var(--admin-border)]">
              {requests.map((request) => (
                <button
                  className={`block w-full px-5 py-4 text-left transition hover:bg-[#F4F8FF] ${selectedRequest?.id === request.id ? "bg-[#F4F8FF]" : "bg-white"}`}
                  key={request.id}
                  onClick={() => setSelectedRequestId(request.id)}
                  type="button"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-black text-[var(--brand-navy)]">{request.tournament_name}</h3>
                    <span className={statusClass(request.status)}>{statusLabels[request.status]}</span>
                  </div>
                  <p className="mt-1 text-sm font-bold text-slate-600">
                    {tournamentTypeLabel(request.tournament_type)} / {request.organizer_name}
                  </p>
                  <p className="mt-1 text-xs font-bold text-slate-500">{formatDate(request.created_at)}</p>
                </button>
              ))}
            </div>
          )}
        </Card>

        {selectedRequest ? (
          <Card>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[#F4F8FF] px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-[#0F4FA8]">
                    {tournamentTypeLabel(selectedRequest.tournament_type)}
                  </span>
                  <span className={statusClass(selectedRequest.status)}>{statusLabels[selectedRequest.status]}</span>
                </div>
                <h2 className="mt-4 text-2xl font-black text-[var(--brand-navy)]">{selectedRequest.tournament_name}</h2>
                <p className="mt-2 text-sm font-bold text-slate-600">Pořadatel: {selectedRequest.organizer_name}</p>
              </div>
              <p className="text-sm font-bold text-slate-500">Vytvořeno: {formatDate(selectedRequest.created_at)}</p>
            </div>

            <div className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
              <Info label="Datum" value={formatPlainDate(selectedRequest.date)} />
              <Info label="Místo" value={selectedRequest.place} />
              <Info label="Počet míst" value={selectedRequest.capacity || "-"} />
              <Info label="Volná místa" value={selectedRequest.free_slots || "-"} />
            </div>

            {selectedRequest.note ? <p className="mt-5 text-sm text-slate-600">{selectedRequest.note}</p> : null}

            <div className="mt-6 grid gap-3">
              <h3 className="text-lg font-black text-[var(--brand-navy)]">Kategorie</h3>
              {selectedRequest.parts.map((part, index) => (
                <section className="rounded-2xl border border-[var(--admin-border)] bg-[#F4F8FF] p-4" key={part.id}>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-black text-[var(--brand-navy)]">{part.category || `Kategorie ${index + 1}`}</h4>
                    {part.is_doubles ? <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-[#0F4FA8]">Dvojice</span> : null}
                  </div>
                  <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                    <Info label="Prezence" value={part.presentation || "-"} />
                    <Info label="Začátek" value={part.start_time || "-"} />
                    <Info label="Formát" value={part.format || "-"} />
                    <Info label="Startovné" value={part.entry_fee || "-"} />
                    {part.comment ? <Info label="Komentář" value={part.comment} wide /> : null}
                  </div>
                </section>
              ))}
            </div>

            <textarea
              className="mt-5 min-h-24 w-full rounded-2xl border border-[var(--admin-border)] px-4 py-3 text-sm outline-none focus:border-[#3B82F6]"
              onChange={(event) => setNotes((current) => ({ ...current, [selectedRequest.id]: event.target.value }))}
              placeholder="Poznámka administrace"
              value={notes[selectedRequest.id] ?? selectedRequest.admin_note ?? ""}
            />

            <div className="mt-4 flex flex-wrap gap-3">
              {selectedRequest.status === "pending" ? (
                <>
                  <Button disabled={processingId === selectedRequest.id} onClick={() => reviewRequest(selectedRequest.id, "approve")} variant="primary">
                    Schválit
                  </Button>
                  <Button disabled={processingId === selectedRequest.id} onClick={() => reviewRequest(selectedRequest.id, "reject")} variant="danger">
                    Zamítnout
                  </Button>
                </>
              ) : (
                <Button disabled={processingId === selectedRequest.id} onClick={() => reviewRequest(selectedRequest.id, "return")} variant="secondary">
                  Vrátit do čekajících
                </Button>
              )}
              <Button disabled={processingId === selectedRequest.id} onClick={() => reviewRequest(selectedRequest.id, "cancel")} variant="secondary">
                Zrušit
              </Button>
              <Button disabled={processingId === selectedRequest.id} onClick={() => deleteRequest(selectedRequest.id)} variant="danger">
                Odstranit žádost
              </Button>
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function Info({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`rounded-2xl bg-[#F4F8FF] px-4 py-3 ${wide ? "sm:col-span-2" : ""}`}>
      <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-1 font-black text-[var(--brand-navy)]">{value}</p>
    </div>
  );
}
