import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/appAuth";
import { loadFacebookUpcomingRound } from "@/lib/facebookUpcomingRound";
import { renderFacebookUpcomingRoundPng } from "@/lib/facebookUpcomingRoundImage";

export const runtime = "nodejs";

type PublishBody = {
  seasonId?: unknown;
  leagueId?: unknown;
  groupId?: unknown;
  roundNumber?: unknown;
  message?: unknown;
};

type GraphSuccess = {
  id?: string;
  post_id?: string;
};

type GraphError = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

function requiredString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function requiredRound(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string" && /^[1-9]\d*$/.test(value)) {
    return Number(value);
  }

  return null;
}

function graphErrorMessage(error: GraphError["error"]) {
  if (!error) {
    return "Facebook API vrátilo neočekávanou chybu.";
  }

  const details = [
    error.message,
    error.type ? `typ: ${error.type}` : null,
    typeof error.code === "number" ? `kód: ${error.code}` : null,
    typeof error.error_subcode === "number" ? `subkód: ${error.error_subcode}` : null,
    error.fbtrace_id ? `trace: ${error.fbtrace_id}` : null,
  ].filter(Boolean);

  return details.length > 0
    ? `Facebook API odmítlo publikování (${details.join(", ")}).`
    : "Facebook API odmítlo publikování.";
}

function safeOrigin(request: NextRequest) {
  return request.nextUrl.origin;
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (guard.response) return guard.response;

  const pageId = process.env.FACEBOOK_PAGE_ID;
  const pageAccessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

  if (!pageId?.trim()) {
    return NextResponse.json(
      { error: "Chybí serverová proměnná FACEBOOK_PAGE_ID." },
      { status: 500 },
    );
  }

  if (!pageAccessToken?.trim()) {
    return NextResponse.json(
      { error: "Chybí serverová proměnná FACEBOOK_PAGE_ACCESS_TOKEN." },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => null)) as PublishBody | null;
  const seasonId = requiredString(body?.seasonId);
  const leagueId = requiredString(body?.leagueId);
  const groupId = requiredString(body?.groupId);
  const roundNumber = requiredRound(body?.roundNumber);
  const message = requiredString(body?.message);

  if (!seasonId || !leagueId || !groupId || !roundNumber) {
    return NextResponse.json(
      { error: "Vyberte platnou sezónu, ligu, skupinu a kolo." },
      { status: 400 },
    );
  }

  if (!message) {
    return NextResponse.json(
      { error: "Text příspěvku nesmí být prázdný." },
      { status: 400 },
    );
  }

  try {
    const payload = await loadFacebookUpcomingRound({
      seasonId,
      leagueId,
      groupId,
      roundNumber,
    });

    if (
      payload.selections.seasonId !== seasonId ||
      payload.selections.leagueId !== leagueId ||
      payload.selections.groupId !== groupId ||
      payload.selections.roundNumber !== roundNumber ||
      payload.matches.length === 0
    ) {
      return NextResponse.json(
        { error: "Vybrané kolo nebylo nalezeno nebo nemá zadané zápasy." },
        { status: 404 },
      );
    }

    let imageBlob: Blob;
    try {
      imageBlob = await renderFacebookUpcomingRoundPng(payload, safeOrigin(request));
    } catch {
      return NextResponse.json(
        { error: "PNG grafiku pro Facebook se nepodařilo vygenerovat." },
        { status: 500 },
      );
    }

    const formData = new FormData();
    formData.set("message", message);
    formData.set("access_token", pageAccessToken);
    formData.set(
      "source",
      new Blob([await imageBlob.arrayBuffer()], { type: "image/png" }),
      `zss-${roundNumber}-kolo.png`,
    );

    const graphResponse = await fetch(
      `https://graph.facebook.com/v26.0/${encodeURIComponent(pageId)}/photos`,
      {
        method: "POST",
        body: formData,
      },
    );
    const graphBody = (await graphResponse.json().catch(() => ({}))) as GraphSuccess & GraphError;

    if (!graphResponse.ok) {
      return NextResponse.json(
        {
          error: graphErrorMessage(graphBody.error),
          facebook: graphBody.error
            ? {
                type: graphBody.error.type,
                code: graphBody.error.code,
                error_subcode: graphBody.error.error_subcode,
                fbtrace_id: graphBody.error.fbtrace_id,
              }
            : null,
        },
        { status: graphResponse.status >= 400 ? graphResponse.status : 502 },
      );
    }

    return NextResponse.json({
      success: true,
      id: graphBody.id ?? null,
      post_id: graphBody.post_id ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Příspěvek se nepodařilo zveřejnit na Facebooku.",
      },
      { status: 500 },
    );
  }
}
