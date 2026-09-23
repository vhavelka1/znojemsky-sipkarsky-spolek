import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/appAuth";
import { loadFacebookUpcomingRound, type FacebookPostType } from "@/lib/facebookUpcomingRound";
import { renderFacebookUpcomingRoundPng } from "@/lib/facebookUpcomingRoundImage";

export const runtime = "nodejs";

type PublishBody = {
  seasonId?: unknown;
  leagueId?: unknown;
  roundNumber?: unknown;
  postType?: unknown;
  message?: unknown;
};

type GraphPhotoSuccess = {
  id?: string;
};

type GraphFeedSuccess = {
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
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^[1-9]\d*$/.test(value)) return Number(value);
  return null;
}

function postTypeValue(value: unknown): FacebookPostType {
  return value === "results" ? "results" : "upcoming";
}

function graphErrorMessage(error: GraphError["error"]) {
  if (!error) return "Facebook API vrátilo neočekávanou chybu.";

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

function graphDetails(error: GraphError["error"]) {
  return error
    ? {
        type: error.type,
        code: error.code,
        error_subcode: error.error_subcode,
        fbtrace_id: error.fbtrace_id,
      }
    : null;
}

async function uploadUnpublishedPhoto({
  blob,
  filename,
  pageAccessToken,
  pageId,
}: {
  blob: Blob;
  filename: string;
  pageAccessToken: string;
  pageId: string;
}) {
  const formData = new FormData();
  formData.set("access_token", pageAccessToken);
  formData.set("published", "false");
  formData.set("source", new Blob([await blob.arrayBuffer()], { type: "image/png" }), filename);

  const response = await fetch(
    `https://graph.facebook.com/v26.0/${encodeURIComponent(pageId)}/photos`,
    {
      method: "POST",
      body: formData,
    },
  );
  const body = (await response.json().catch(() => ({}))) as GraphPhotoSuccess & GraphError;

  if (!response.ok || !body.id) {
    return {
      error: NextResponse.json(
        {
          error: graphErrorMessage(body.error),
          facebook: graphDetails(body.error),
        },
        { status: response.status >= 400 ? response.status : 502 },
      ),
      id: null,
    };
  }

  return { error: null, id: body.id };
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
  const roundNumber = requiredRound(body?.roundNumber);
  const message = requiredString(body?.message);
  const postType = postTypeValue(body?.postType);

  if (!seasonId || !leagueId || !roundNumber) {
    return NextResponse.json(
      { error: "Vyberte platnou sezónu, ligu a kolo." },
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
      roundNumber,
      postType,
      origin: request.nextUrl.origin,
    });

    if (
      payload.selections.seasonId !== seasonId ||
      payload.selections.leagueId !== leagueId ||
      payload.selections.roundNumber !== roundNumber ||
      payload.images.length === 0
    ) {
      return NextResponse.json(
        { error: "Vybrané kolo nebylo nalezeno nebo nemá připravené grafiky." },
        { status: 404 },
      );
    }

    const mediaIds: string[] = [];
    for (const image of payload.images) {
      let imageBlob: Blob;
      try {
        imageBlob = await renderFacebookUpcomingRoundPng(payload, request.nextUrl.origin, {
          groupId: image.groupId,
          kind: image.kind,
        });
      } catch {
        return NextResponse.json(
          { error: "PNG grafiku pro Facebook se nepodařilo vygenerovat." },
          { status: 500 },
        );
      }

      const upload = await uploadUnpublishedPhoto({
        blob: imageBlob,
        filename: `zss-${roundNumber}-kolo-${image.groupName}-${image.kind}.png`,
        pageAccessToken,
        pageId,
      });
      if (upload.error) return upload.error;
      if (upload.id) mediaIds.push(upload.id);
    }

    const feedFormData = new FormData();
    feedFormData.set("access_token", pageAccessToken);
    feedFormData.set("message", message);
    mediaIds.forEach((mediaId, index) => {
      feedFormData.set(`attached_media[${index}]`, JSON.stringify({ media_fbid: mediaId }));
    });

    const graphResponse = await fetch(
      `https://graph.facebook.com/v26.0/${encodeURIComponent(pageId)}/feed`,
      {
        method: "POST",
        body: feedFormData,
      },
    );
    const graphBody = (await graphResponse.json().catch(() => ({}))) as GraphFeedSuccess & GraphError;

    if (!graphResponse.ok) {
      return NextResponse.json(
        {
          error: graphErrorMessage(graphBody.error),
          facebook: graphDetails(graphBody.error),
        },
        { status: graphResponse.status >= 400 ? graphResponse.status : 502 },
      );
    }

    return NextResponse.json({
      success: true,
      id: graphBody.id ?? null,
      post_id: graphBody.post_id ?? graphBody.id ?? null,
      photo_ids: mediaIds,
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
