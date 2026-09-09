"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { Button, Card, PageHeader } from "@/components/ui/admin";

type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";
type MatchSide = "home" | "away";

type MatchRescheduleRequest = {
  id: string;
  match_id: string;
  requested_by_side: MatchSide | null;
  current_scheduled_at: string;
  requested_scheduled_at: string;
  reason: string;
  status: RequestStatus;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  requestedByName: string;
  match: {
    round_number: number | null;
    homeTeamName: string;
    awayTeamName: string;
    seasonName: string;
    leagueName: string;
    groupName: string;
  } | null;
};

type RequestsPayload = {
  requests?: MatchRescheduleRequest[];
  error?: string;
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("cs-CZ", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function statusLabel(status: RequestStatus) {
  if (status === "pending") return "Čeká na schválení";
  if (status === "approved") return "Schváleno";
  if (status === "rejected") return "Zamítnuto";
  return "Zrušeno";
}

function statusClass(status: RequestStatus) {
  if (status === "pending") return "admin-badge";
  if (status === "approved") return "rounded-full bg-green-100 px-3 py-1 text-xs font-black text-green-800";
  if (status === "rejected") return "rounded-full bg-red-100 px-3 py-1 text-xs font-black text-red-800";
  return "rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700";
}

export default function AdminMatchRescheduleRequestsPage() {
  const [requests, setRequests] = useState<MatchRescheduleRequest[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadRequests = () => {
    setIsLoading(true);
    setError(null);
    adminFetch("/api/admin/match-reschedule-requests", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as RequestsPayload;
        if (!response.ok) throw new Error(body.error ?? "Žádosti se nepodařilo načíst.");
        setRequests(body.requests ?? []);
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Žádosti se nepodařilo načíst."))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(loadRequests, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  const reviewRequest = async (id: string, action: "approve" | "reject") => {
    setProcessingId(id);
    setError(null);
    setMessage(null);

    const response = await adminFetch("/api/admin/match-reschedule-requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        action,
        review_note: notes[id] ?? "",
      }),
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    setProcessingId(null);

    if (!response.ok) {
      setError(body.error ?? "Žádost se nepodařilo zpracovat.");
      return;
    }

    setMessage(action === "approve" ? "Termín byl změněn." : "Žádost byla zamítnuta.");
    loadRequests();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        description="Schvalování žádostí kapitánů a zástupců o změnu termínu zápasu."
        title="Žádosti termínů"
      />

      {message ? <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-800">{message}</div> : null}
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

      <Card>
        {isLoading ? (
          <p className="text-sm font-bold text-[var(--admin-muted)]">Načítám žádosti...</p>
        ) : requests.length === 0 ? (
          <p className="text-sm font-bold text-[var(--admin-muted)]">Nejsou evidované žádné žádosti.</p>
        ) : (
          <div className="space-y-4">
            {requests.map((request) => (
              <article className="rounded-2xl border border-[var(--admin-border)] bg-white p-4" key={request.id}>
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-black text-[var(--brand-navy)]">
                        {request.match ? `${request.match.homeTeamName} vs. ${request.match.awayTeamName}` : "Zápas"}
                      </h2>
                      <span className={statusClass(request.status)}>{statusLabel(request.status)}</span>
                    </div>
                    {request.match ? (
                      <p className="mt-1 text-sm font-bold text-[var(--admin-muted)]">
                        {request.match.seasonName} / {request.match.leagueName} / {request.match.groupName}
                        {request.match.round_number ? ` / ${request.match.round_number}. kolo` : ""}
                      </p>
                    ) : null}
                    <div className="mt-3 grid gap-2 text-sm font-bold text-[var(--admin-muted)] sm:grid-cols-2">
                      <p>Původní termín: {formatDateTime(request.current_scheduled_at)}</p>
                      <p>Navržený termín: {formatDateTime(request.requested_scheduled_at)}</p>
                      <p>Žádá: {request.requestedByName}</p>
                      <p>Strana: {request.requested_by_side === "home" ? "domácí" : request.requested_by_side === "away" ? "hosté" : "administrace"}</p>
                    </div>
                    <p className="mt-3 text-sm text-[var(--brand-navy)]">{request.reason}</p>
                    {request.review_note ? (
                      <p className="mt-3 text-sm font-bold text-[var(--admin-muted)]">Poznámka: {request.review_note}</p>
                    ) : null}
                    <div className="mt-4">
                      <Link
                        className="inline-flex rounded-xl border border-[var(--admin-border)] px-4 py-2 text-sm font-bold text-[var(--brand-navy)] hover:bg-[#F4F8FF]"
                        href={`/admin/matches/${request.match_id}`}
                      >
                        Otevřít zápis
                      </Link>
                    </div>
                  </div>

                  {request.status === "pending" ? (
                    <div className="grid gap-3 xl:w-[360px]">
                      <textarea
                        className="min-h-20 rounded-2xl border border-[var(--admin-border)] bg-white px-4 py-3 text-sm outline-none focus:border-[var(--brand-blue)]"
                        onChange={(event) => setNotes((current) => ({ ...current, [request.id]: event.target.value }))}
                        placeholder="Poznámka k vyřízení"
                        value={notes[request.id] ?? ""}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button disabled={processingId === request.id} onClick={() => reviewRequest(request.id, "approve")} variant="primary">
                          Schválit změnu
                        </Button>
                        <Button disabled={processingId === request.id} onClick={() => reviewRequest(request.id, "reject")} variant="danger">
                          Zamítnout
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm font-bold text-[var(--admin-muted)] xl:w-[220px]">
                      {request.reviewed_at ? `Vyřízeno ${formatDateTime(request.reviewed_at)}` : ""}
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
