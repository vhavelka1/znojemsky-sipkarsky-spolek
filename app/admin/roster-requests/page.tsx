"use client";

import { useEffect, useState } from "react";
import { Button, Card, PageHeader } from "@/components/ui/admin";
import { adminFetch } from "@/lib/adminFetch";

type RosterRequest = {
  id: string;
  requested_player_name: string;
  requested_player_email: string | null;
  requested_player_note: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  admin_note: string | null;
  created_at: string;
  teamName: string;
  seasonName: string;
};

type RequestsPayload = {
  requests?: RosterRequest[];
  error?: string;
};

function statusLabel(status: RosterRequest["status"]) {
  if (status === "pending") return "Čeká na schválení";
  if (status === "approved") return "Schváleno";
  if (status === "rejected") return "Zamítnuto";
  return "Zrušeno";
}

function statusClass(status: RosterRequest["status"]) {
  if (status === "pending") return "admin-badge";
  if (status === "approved") return "rounded-full bg-green-100 px-3 py-1 text-xs font-black text-green-800";
  if (status === "rejected") return "rounded-full bg-red-100 px-3 py-1 text-xs font-black text-red-800";
  return "rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700";
}

export default function AdminRosterRequestsPage() {
  const [requests, setRequests] = useState<RosterRequest[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadRequests = () => {
    setIsLoading(true);
    setError(null);
    adminFetch("/api/admin/roster-requests", { cache: "no-store" })
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

    const response = await adminFetch("/api/admin/roster-requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        action,
        admin_note: notes[id] ?? "",
      }),
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    setProcessingId(null);

    if (!response.ok) {
      setError(body.error ?? "Žádost se nepodařilo zpracovat.");
      return;
    }

    setMessage(action === "approve" ? "Žádost byla schválena." : "Žádost byla zamítnuta.");
    loadRequests();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        description="Schvalování žádostí kapitánů o doplnění hráčů na soupisku."
        title="Žádosti soupisky"
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
                      <h2 className="text-lg font-black text-[var(--brand-navy)]">{request.requested_player_name}</h2>
                      <span className={statusClass(request.status)}>{statusLabel(request.status)}</span>
                    </div>
                    <p className="mt-1 text-sm font-bold text-[var(--admin-muted)]">
                      {request.teamName} · {request.seasonName}
                    </p>
                    {request.requested_player_email ? (
                      <p className="mt-2 text-sm font-bold text-[var(--brand-blue)]">{request.requested_player_email}</p>
                    ) : null}
                    {request.requested_player_note ? (
                      <p className="mt-3 text-sm text-[var(--admin-muted)]">{request.requested_player_note}</p>
                    ) : null}
                    {request.admin_note ? (
                      <p className="mt-3 text-sm font-bold text-[var(--admin-muted)]">Poznámka: {request.admin_note}</p>
                    ) : null}
                  </div>

                  {request.status === "pending" ? (
                    <div className="grid gap-3 xl:w-[360px]">
                      <textarea
                        className="min-h-20 rounded-2xl border border-[var(--admin-border)] bg-white px-4 py-3 text-sm outline-none focus:border-[var(--brand-blue)]"
                        onChange={(event) => setNotes((current) => ({ ...current, [request.id]: event.target.value }))}
                        placeholder="Poznámka pro kapitána"
                        value={notes[request.id] ?? ""}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button disabled={processingId === request.id} onClick={() => reviewRequest(request.id, "approve")} variant="primary">
                          Schválit
                        </Button>
                        <Button disabled={processingId === request.id} onClick={() => reviewRequest(request.id, "reject")} variant="danger">
                          Zamítnout
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
