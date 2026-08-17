import { NextResponse } from "next/server";
import { requireModeratorOrAdmin } from "@/lib/appAuth";
import { loadTournamentRequests, saveTournamentRequests, type TournamentRequestStatus } from "@/lib/tournamentRequests";

type ReviewBody = {
  id?: unknown;
  action?: unknown;
  admin_note?: unknown;
};

function optionalString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function statusForAction(action: string | null): TournamentRequestStatus | null {
  if (action === "approve") return "approved";
  if (action === "reject") return "rejected";
  if (action === "cancel") return "cancelled";
  if (action === "return") return "pending";
  return null;
}

export async function GET(request: Request) {
  const guard = await requireModeratorOrAdmin(request);
  if (guard.response) return guard.response;

  try {
    const requests = await loadTournamentRequests();
    return NextResponse.json({ requests });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Žádosti turnajů se nepodařilo načíst.", requests: [] },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const guard = await requireModeratorOrAdmin(request);
  if (guard.response) return guard.response;

  const body = (await request.json().catch(() => ({}))) as ReviewBody;
  const id = optionalString(body.id);
  const status = statusForAction(optionalString(body.action));

  if (!id || !status) {
    return NextResponse.json({ error: "Vyberte platnou žádost a akci." }, { status: 400 });
  }

  try {
    const requests = await loadTournamentRequests();
    const requestExists = requests.some((item) => item.id === id);

    if (!requestExists) {
      return NextResponse.json({ error: "Žádost nebyla nalezena." }, { status: 404 });
    }

    const reviewedAt = new Date().toISOString();
    const updatedRequests = requests.map((item) =>
      item.id === id
        ? {
            ...item,
            status,
            admin_note: optionalString(body.admin_note),
            reviewed_at: reviewedAt,
            reviewed_by_user_id: guard.profile!.userId,
          }
        : item,
    );

    await saveTournamentRequests(updatedRequests);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Žádost turnaje se nepodařilo zpracovat." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const guard = await requireModeratorOrAdmin(request);
  if (guard.response) return guard.response;

  const id = optionalString(new URL(request.url).searchParams.get("id"));

  if (!id) {
    return NextResponse.json({ error: "Vyberte platnou žádost." }, { status: 400 });
  }

  try {
    const requests = await loadTournamentRequests();
    const updatedRequests = requests.filter((item) => item.id !== id);

    if (updatedRequests.length === requests.length) {
      return NextResponse.json({ error: "Žádost nebyla nalezena." }, { status: 404 });
    }

    await saveTournamentRequests(updatedRequests);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Žádost turnaje se nepodařilo odstranit." },
      { status: 500 },
    );
  }
}
