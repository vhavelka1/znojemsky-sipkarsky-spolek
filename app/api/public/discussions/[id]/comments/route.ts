import { NextResponse } from "next/server";
import { getAppRequester, hasAtLeastRole } from "@/lib/appAuth";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function discussionSchemaError(error: { message?: string } | null | undefined) {
  const message = error?.message ?? "";
  return message.includes("discussion_topics") || message.includes("discussion_comments")
    ? "Nejprve spusťte SQL soubor supabase/apply_discussions_in_dashboard.sql v Supabase SQL Editoru."
    : message;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const requester = await getAppRequester(request);

    if (!requester || !hasAtLeastRole(requester.role, "player")) {
      return NextResponse.json({ error: "Komentovat může pouze přihlášený hráč." }, { status: 403 });
    }

    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { body?: unknown };
    const commentBody = textValue(body.body);

    if (commentBody.length < 2) {
      return NextResponse.json({ error: "Komentář musí mít alespoň 2 znaky." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { data: topic, error: topicError } = await supabase
      .from("discussion_topics")
      .select("id, comment_count")
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (topicError) {
      return NextResponse.json({ error: discussionSchemaError(topicError) || "Téma nebylo nalezeno." }, { status: 404 });
    }

    const { data: comment, error: commentError } = await supabase
      .from("discussion_comments")
      .insert({
        topic_id: topic.id,
        body: commentBody,
        created_by_user_id: requester.userId,
        created_by_player_id: requester.playerId,
      })
      .select("id, body, created_at")
      .single();

    if (commentError) {
      return NextResponse.json({ error: discussionSchemaError(commentError) }, { status: 500 });
    }

    const lastCommentedAt = comment.created_at;
    const { error: topicUpdateError } = await supabase
      .from("discussion_topics")
      .update({
        last_commented_at: lastCommentedAt,
        comment_count: (topic.comment_count ?? 0) + 1,
      })
      .eq("id", topic.id);

    if (topicUpdateError) {
      return NextResponse.json({ error: discussionSchemaError(topicUpdateError) }, { status: 500 });
    }

    return NextResponse.json({
      comment: {
        id: comment.id,
        body: comment.body,
        authorName: requester.displayName,
        createdAt: comment.created_at,
      },
      topicUpdate: {
        lastCommentedAt,
        commentCount: (topic.comment_count ?? 0) + 1,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Komentář se nepodařilo uložit." },
      { status: 500 },
    );
  }
}
