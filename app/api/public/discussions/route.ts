import { NextResponse } from "next/server";
import { getAppRequester, hasAtLeastRole } from "@/lib/appAuth";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

type TopicRow = {
  id: string;
  title: string;
  body: string;
  created_by_player_id: string | null;
  last_commented_at: string;
  comment_count: number;
  created_at: string;
};

type CommentRow = {
  id: string;
  topic_id: string;
  body: string;
  created_by_player_id: string | null;
  created_at: string;
};

type PlayerRow = {
  id: string;
  display_name: string;
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

function mapAuthorName(playersById: Map<string, string>, playerId: string | null) {
  return playerId ? playersById.get(playerId) ?? "Neznámý hráč" : "Neznámý hráč";
}

export async function GET(request: Request) {
  try {
    const supabase = createSupabaseAdminClient();
    const requester = await getAppRequester(request).catch(() => null);
    const { data: topics, error: topicsError } = await supabase
      .from("discussion_topics")
      .select("id, title, body, created_by_player_id, last_commented_at, comment_count, created_at")
      .is("deleted_at", null)
      .order("last_commented_at", { ascending: false })
      .order("created_at", { ascending: false });

    if (topicsError) {
      return NextResponse.json({ error: discussionSchemaError(topicsError), topics: [] }, { status: 500 });
    }

    const topicIds = (topics ?? []).map((topic) => topic.id);
    const { data: comments, error: commentsError } = topicIds.length
      ? await supabase
          .from("discussion_comments")
          .select("id, topic_id, body, created_by_player_id, created_at")
          .in("topic_id", topicIds)
          .is("deleted_at", null)
          .order("created_at", { ascending: true })
      : { data: [] as CommentRow[], error: null };

    if (commentsError) {
      return NextResponse.json({ error: discussionSchemaError(commentsError), topics: [] }, { status: 500 });
    }

    const playerIds = new Set<string>();
    (topics ?? []).forEach((topic) => {
      if (topic.created_by_player_id) playerIds.add(topic.created_by_player_id);
    });
    (comments ?? []).forEach((comment) => {
      if (comment.created_by_player_id) playerIds.add(comment.created_by_player_id);
    });

    const { data: players, error: playersError } = playerIds.size
      ? await supabase.from("players").select("id, display_name").in("id", [...playerIds])
      : { data: [] as PlayerRow[], error: null };

    if (playersError) {
      return NextResponse.json({ error: playersError.message, topics: [] }, { status: 500 });
    }

    const playersById = new Map((players ?? []).map((player) => [player.id, player.display_name]));
    const commentsByTopic = new Map<string, CommentRow[]>();
    (comments ?? []).forEach((comment) => {
      commentsByTopic.set(comment.topic_id, [...(commentsByTopic.get(comment.topic_id) ?? []), comment]);
    });

    return NextResponse.json({
      currentUser: requester
        ? {
            displayName: requester.displayName,
            role: requester.role,
            canCreateTopic: hasAtLeastRole(requester.role, "captain"),
            canComment: hasAtLeastRole(requester.role, "player"),
          }
        : null,
      topics: ((topics ?? []) as TopicRow[]).map((topic) => ({
        id: topic.id,
        title: topic.title,
        body: topic.body,
        authorName: mapAuthorName(playersById, topic.created_by_player_id),
        lastCommentedAt: topic.last_commented_at,
        commentCount: topic.comment_count,
        createdAt: topic.created_at,
        comments: (commentsByTopic.get(topic.id) ?? []).map((comment) => ({
          id: comment.id,
          body: comment.body,
          authorName: mapAuthorName(playersById, comment.created_by_player_id),
          createdAt: comment.created_at,
        })),
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Diskuzi se nepodařilo načíst.", topics: [] },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const requester = await getAppRequester(request);

    if (!requester || !hasAtLeastRole(requester.role, "captain")) {
      return NextResponse.json(
        { error: "Téma může vytvořit pouze kapitán, moderátor nebo administrátor." },
        { status: 403 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as { title?: unknown; body?: unknown };
    const title = textValue(body.title);
    const topicBody = textValue(body.body);

    if (title.length < 3) {
      return NextResponse.json({ error: "Zadejte název tématu alespoň o 3 znacích." }, { status: 400 });
    }

    if (topicBody.length < 3) {
      return NextResponse.json({ error: "Zadejte úvodní text tématu." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { data: topic, error } = await supabase
      .from("discussion_topics")
      .insert({
        title,
        body: topicBody,
        created_by_user_id: requester.userId,
        created_by_player_id: requester.playerId,
        last_commented_at: new Date().toISOString(),
        comment_count: 0,
      })
      .select("id, title, body, created_at, last_commented_at, comment_count")
      .single();

    if (error) {
      return NextResponse.json({ error: discussionSchemaError(error) }, { status: 500 });
    }

    return NextResponse.json({
      topic: {
        id: topic.id,
        title: topic.title,
        body: topic.body,
        authorName: requester.displayName,
        lastCommentedAt: topic.last_commented_at,
        commentCount: topic.comment_count,
        createdAt: topic.created_at,
        comments: [],
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Téma se nepodařilo vytvořit." },
      { status: 500 },
    );
  }
}
