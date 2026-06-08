"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type UserRole = "guest" | "player" | "captain" | "moderator" | "admin";

type CurrentUser = {
  displayName: string;
  role: UserRole;
  canCreateTopic: boolean;
  canComment: boolean;
};

type DiscussionComment = {
  id: string;
  body: string;
  authorName: string;
  createdAt: string;
};

type DiscussionTopic = {
  id: string;
  title: string;
  body: string;
  authorName: string;
  lastCommentedAt: string;
  commentCount: number;
  createdAt: string;
  comments: DiscussionComment[];
};

type DiscussionPayload = {
  currentUser: CurrentUser | null;
  topics: DiscussionTopic[];
  error?: string;
};

const navigationItems = [
  { href: "/", label: "Úvod" },
  { href: "/tabulky", label: "Liga" },
  { href: "/turnaje", label: "Turnaje" },
  { href: "/kalendar", label: "Kalendář" },
  { href: "/hraci", label: "Hráči" },
  { href: "/tymy", label: "Týmy" },
  { href: "/galerie", label: "Galerie" },
  { href: "/scoreboard", label: "Počítadlo" },
  { href: "/diskuze", label: "Diskuze" },
  { href: "/kontakt", label: "Kontakt" },
];

const roleLabels: Record<UserRole, string> = {
  guest: "host",
  player: "hráč",
  captain: "kapitán",
  moderator: "moderátor",
  admin: "administrátor",
};

function PublicHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#061A3A]/95 text-white shadow-[0_14px_40px_rgba(6,26,58,0.22)] backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-4 py-3 sm:px-6 lg:px-8">
        <Link aria-label="Znojemský šipkařský spolek" className="flex items-center gap-3" href="/">
          <Image
            alt="Logo Znojemského šipkařského spolku"
            className="h-14 w-14 object-contain drop-shadow-lg sm:h-16 sm:w-16"
            height={256}
            priority
            src="/brand/zss-logo.png"
            width={256}
          />
          <div className="hidden leading-tight sm:block">
            <p className="text-sm font-black uppercase tracking-[0.14em]">Znojemský</p>
            <p className="text-lg font-black uppercase tracking-[0.08em] text-[#3B82F6]">Šipkařský spolek</p>
          </div>
        </Link>
        <div className="flex min-w-0 items-center gap-3">
          <nav className="hidden items-center gap-5 xl:flex">
            {navigationItems.map((item) => (
              <Link
                className={`text-sm font-extrabold transition ${
                  item.href === "/diskuze" ? "text-white" : "text-blue-100 hover:text-white"
                }`}
                href={item.href}
                key={item.href}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <Link
            className="shrink-0 rounded-full bg-[#EF233C] px-4 py-2 text-sm font-black text-white shadow-lg shadow-red-950/25 transition hover:-translate-y-0.5 hover:bg-red-500"
            href="/admin"
          >
            Administrace
          </Link>
        </div>
      </div>
      <nav className="mx-auto flex max-w-7xl gap-4 overflow-x-auto px-4 pb-3 sm:px-6 xl:hidden">
        {navigationItems.map((item) => (
          <Link
            className={`whitespace-nowrap rounded-full border px-3 py-2 text-sm font-bold ${
              item.href === "/diskuze" ? "border-white bg-white text-[#061A3A]" : "border-white/10 bg-white/5 text-blue-100"
            }`}
            href={item.href}
            key={item.href}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

function PublicFooter() {
  return (
    <footer className="bg-[#061A3A] text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <div className="flex items-center gap-4">
          <Image
            alt="Logo Znojemského šipkařského spolku"
            className="h-14 w-14 object-contain"
            height={256}
            src="/brand/zss-logo.png"
            width={256}
          />
          <div>
            <p className="font-black">Znojemský šipkařský spolek</p>
            <p className="text-sm text-blue-200">Komunitní diskuze pro hráče a kapitány.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 text-sm font-bold text-blue-100">
          <Link href="/">Úvod</Link>
          <Link href="/tabulky">Tabulky</Link>
          <Link href="/turnaje">Turnaje</Link>
          <Link href="/galerie">Galerie</Link>
          <Link href="/admin">Administrace</Link>
        </div>
      </div>
    </footer>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("cs-CZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function authHeaders(accessToken: string | null) {
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined;
}

async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function sortTopics(topics: DiscussionTopic[]) {
  return [...topics].sort((left, right) => {
    const rightTime = new Date(right.lastCommentedAt).getTime();
    const leftTime = new Date(left.lastCommentedAt).getTime();
    return rightTime - leftTime;
  });
}

export default function PublicDiscussionPage() {
  const [topics, setTopics] = useState<DiscussionTopic[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);
  const [newTopicTitle, setNewTopicTitle] = useState("");
  const [newTopicBody, setNewTopicBody] = useState("");
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const commentCount = useMemo(() => topics.reduce((sum, topic) => sum + topic.comments.length, 0), [topics]);
  const latestTopic = topics[0] ?? null;

  async function loadDiscussions() {
    setIsLoading(true);
    setError(null);
    const token = await getAccessToken();
    const response = await fetch("/api/public/discussions", {
      headers: authHeaders(token),
    });
    const body = (await response.json().catch(() => ({}))) as DiscussionPayload;

    if (!response.ok) {
      setError(body.error ?? "Diskuzi se nepodařilo načíst.");
      setTopics([]);
      setCurrentUser(body.currentUser ?? null);
      setIsLoading(false);
      return;
    }

    const sortedTopics = sortTopics(body.topics ?? []);
    setTopics(sortedTopics);
    setCurrentUser(body.currentUser ?? null);
    setActiveTopicId((current) => current ?? sortedTopics[0]?.id ?? null);
    setIsLoading(false);
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadDiscussions();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  async function handleCreateTopic(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setMessage(null);
    const token = await getAccessToken();
    const response = await fetch("/api/public/discussions", {
      body: JSON.stringify({ title: newTopicTitle, body: newTopicBody }),
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(token),
      },
      method: "POST",
    });
    const body = (await response.json().catch(() => ({}))) as { topic?: DiscussionTopic; error?: string };

    if (!response.ok || !body.topic) {
      setError(body.error ?? "Téma se nepodařilo vytvořit.");
      setIsSubmitting(false);
      return;
    }

    setTopics((current) => sortTopics([body.topic!, ...current]));
    setActiveTopicId(body.topic.id);
    setNewTopicTitle("");
    setNewTopicBody("");
    setIsCreateOpen(false);
    setMessage("Téma bylo vytvořeno.");
    setIsSubmitting(false);
  }

  async function handleAddComment(topicId: string) {
    const draft = commentDrafts[topicId]?.trim() ?? "";
    if (!draft) {
      setError("Zadejte text komentáře.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setMessage(null);
    const token = await getAccessToken();
    const response = await fetch(`/api/public/discussions/${topicId}/comments`, {
      body: JSON.stringify({ body: draft }),
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(token),
      },
      method: "POST",
    });
    const body = (await response.json().catch(() => ({}))) as {
      comment?: DiscussionComment;
      topicUpdate?: { lastCommentedAt: string; commentCount: number };
      error?: string;
    };

    if (!response.ok || !body.comment || !body.topicUpdate) {
      setError(body.error ?? "Komentář se nepodařilo uložit.");
      setIsSubmitting(false);
      return;
    }

    setTopics((current) =>
      sortTopics(
        current.map((topic) =>
          topic.id === topicId
            ? {
                ...topic,
                comments: [...topic.comments, body.comment!],
                commentCount: body.topicUpdate!.commentCount,
                lastCommentedAt: body.topicUpdate!.lastCommentedAt,
              }
            : topic,
        ),
      ),
    );
    setCommentDrafts((current) => ({ ...current, [topicId]: "" }));
    setMessage("Komentář byl uložen.");
    setIsSubmitting(false);
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#F4F8FF] text-[#0B1F3A]">
      <PublicHeader />

      <section className="relative isolate overflow-hidden bg-[#061A3A] text-white">
        <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_18%_18%,rgba(59,130,246,0.36),transparent_34%),radial-gradient(circle_at_86%_42%,rgba(239,35,60,0.25),transparent_30%),linear-gradient(135deg,#061A3A_0%,#0B2F6B_50%,#061A3A_100%)]" />
        <Image
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 top-8 -z-10 h-auto w-[520px] max-w-[72vw] opacity-[0.08]"
          height={900}
          src="/brand/zss-logo.png"
          width={700}
        />
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_0.85fr] lg:px-8 lg:py-16">
          <div>
            <p className="inline-flex rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-blue-100">
              Komunitní fórum
            </p>
            <h1 className="mt-7 text-5xl font-black tracking-tight sm:text-6xl">Diskuze</h1>
            <p className="mt-5 max-w-2xl text-xl font-bold leading-8 text-blue-100">
              Prostor pro kapitány, hráče a správce spolku. Témata jsou řazená podle posledního komentáře.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button
                className="rounded-full bg-[#EF233C] px-6 py-3 text-base font-black text-white shadow-xl shadow-red-950/25 transition hover:-translate-y-0.5 hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-55"
                disabled={!currentUser?.canCreateTopic}
                onClick={() => setIsCreateOpen((current) => !current)}
                type="button"
              >
                Vytvořit téma
              </button>
              <Link
                className="rounded-full bg-white px-6 py-3 text-base font-black text-[#061A3A] shadow-xl shadow-black/15 transition hover:-translate-y-0.5 hover:bg-blue-50"
                href="/galerie"
              >
                Galerie
              </Link>
            </div>
            <div className="mt-8 grid max-w-xl grid-cols-3 gap-3 sm:gap-5">
              {[
                ["Témat", isLoading ? "-" : topics.length],
                ["Komentářů", isLoading ? "-" : commentCount],
                ["Role", currentUser ? roleLabels[currentUser.role] : "host"],
              ].map(([label, value]) => (
                <div className="rounded-3xl border border-white/15 bg-white/10 p-4 backdrop-blur" key={label}>
                  <p className="text-2xl font-black sm:text-3xl">{value}</p>
                  <p className="mt-1 text-xs font-black uppercase tracking-[0.12em] text-blue-100">{label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-[#3B82F6]/20 blur-3xl" />
            <div className="relative rounded-[32px] border border-white/15 bg-white/10 p-6 shadow-[0_30px_80px_rgba(0,0,0,0.28)] backdrop-blur">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#3B82F6]">Naposledy aktivní</p>
              <h2 className="mt-3 text-3xl font-black">{latestTopic?.title ?? "Zatím žádné téma"}</h2>
              <p className="mt-4 text-sm font-bold leading-6 text-blue-100">
                {latestTopic
                  ? `${latestTopic.commentCount} komentářů / poslední aktivita ${formatDateTime(latestTopic.lastCommentedAt)}`
                  : "První téma může založit kapitán, moderátor nebo administrátor."}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {!currentUser?.canComment ? (
          <div className="rounded-[28px] border border-[#D8E4F2] bg-white px-5 py-4 text-sm font-bold text-slate-600 shadow-[0_20px_60px_rgba(6,26,58,0.08)]">
            Diskuzi může číst každý. Komentovat mohou pouze přihlášení hráči a vyšší role. Nová témata zakládají kapitáni, moderátoři a administrátoři.
          </div>
        ) : null}

        {message ? (
          <div className="mt-4 rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-black text-emerald-700">
            {message}
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-black text-red-700">
            {error}
          </div>
        ) : null}

        {isCreateOpen && currentUser?.canCreateTopic ? (
          <section className="mt-6 rounded-[28px] border border-[#D8E4F2] bg-white p-5 shadow-[0_20px_60px_rgba(6,26,58,0.08)] sm:p-6">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#EF233C]">Nové téma</p>
                <h2 className="mt-1 text-2xl font-black tracking-tight text-[#061A3A]">Vytvořit diskuzi</h2>
              </div>
              <button
                className="rounded-full border border-[#D8E4F2] bg-[#F4F8FF] px-4 py-2 text-sm font-black text-[#061A3A] transition hover:-translate-y-0.5 hover:bg-blue-50"
                onClick={() => setIsCreateOpen(false)}
                type="button"
              >
                Zavřít
              </button>
            </div>

            <form className="grid gap-4" onSubmit={handleCreateTopic}>
              <label className="grid gap-2 text-sm font-black text-[#061A3A]">
                Název tématu
                <input
                  className="min-h-12 rounded-2xl border border-[#D8E4F2] bg-white px-4 py-3 text-sm font-bold outline-none transition focus:border-[#0F4FA8] focus:ring-4 focus:ring-blue-100"
                  onChange={(event) => setNewTopicTitle(event.target.value)}
                  required
                  value={newTopicTitle}
                />
              </label>
              <label className="grid gap-2 text-sm font-black text-[#061A3A]">
                Úvodní text
                <textarea
                  className="min-h-32 rounded-2xl border border-[#D8E4F2] bg-white px-4 py-3 text-sm font-bold outline-none transition focus:border-[#0F4FA8] focus:ring-4 focus:ring-blue-100"
                  onChange={(event) => setNewTopicBody(event.target.value)}
                  required
                  value={newTopicBody}
                />
              </label>
              <div className="flex justify-end">
                <button
                  className="rounded-full bg-[#EF233C] px-6 py-3 text-sm font-black text-white shadow-lg shadow-red-950/10 transition hover:-translate-y-0.5 hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isSubmitting}
                  type="submit"
                >
                  {isSubmitting ? "Ukládám..." : "Založit téma"}
                </button>
              </div>
            </form>
          </section>
        ) : null}
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-4 pb-14 sm:px-6 lg:grid-cols-[360px_1fr] lg:px-8">
        <aside className="rounded-[28px] border border-[#D8E4F2] bg-white shadow-[0_20px_60px_rgba(6,26,58,0.08)]">
          <div className="border-b border-[#D8E4F2] px-5 py-5">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#EF233C]">Témata</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-[#061A3A]">Seznam diskuzí</h2>
          </div>
          {isLoading ? <p className="px-5 py-6 text-sm font-bold text-slate-500">Načítám diskuzi...</p> : null}
          {!isLoading && topics.length === 0 ? (
            <p className="px-5 py-6 text-sm font-bold text-slate-500">Zatím není založené žádné téma.</p>
          ) : null}
          <div className="divide-y divide-[#D8E4F2]">
            {topics.map((topic) => (
              <button
                className={`block w-full px-5 py-4 text-left transition ${
                  activeTopicId === topic.id ? "bg-[#F4F8FF]" : "hover:bg-[#F4F8FF]"
                }`}
                key={topic.id}
                onClick={() => setActiveTopicId(topic.id)}
                type="button"
              >
                <span className="block text-base font-black text-[#061A3A]">{topic.title}</span>
                <span className="mt-2 block text-xs font-bold text-slate-500">
                  {topic.commentCount} komentářů / {formatDateTime(topic.lastCommentedAt)}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="min-w-0">
          {topics
            .filter((topic) => topic.id === activeTopicId)
            .map((topic) => (
              <article
                className="overflow-hidden rounded-[28px] border border-[#D8E4F2] bg-white shadow-[0_20px_60px_rgba(6,26,58,0.08)]"
                key={topic.id}
              >
                <div className="border-b border-[#D8E4F2] px-5 py-5 sm:px-6">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#EF233C]">
                    {topic.authorName} / {formatDateTime(topic.createdAt)}
                  </p>
                  <h2 className="mt-2 text-3xl font-black tracking-tight text-[#061A3A]">{topic.title}</h2>
                  <p className="mt-4 whitespace-pre-wrap text-base font-bold leading-7 text-slate-700">{topic.body}</p>
                </div>

                <div className="divide-y divide-[#D8E4F2]">
                  {topic.comments.length === 0 ? (
                    <p className="px-5 py-6 text-sm font-bold text-slate-500 sm:px-6">Téma zatím nemá žádné komentáře.</p>
                  ) : null}
                  {topic.comments.map((comment) => (
                    <div className="px-5 py-5 sm:px-6" key={comment.id}>
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-[#0F4FA8] px-3 py-1 text-xs font-black text-white">{comment.authorName}</span>
                        <span className="text-xs font-bold text-slate-500">{formatDateTime(comment.createdAt)}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm font-bold leading-6 text-slate-700">{comment.body}</p>
                    </div>
                  ))}
                </div>

                <div className="border-t border-[#D8E4F2] bg-[#F4F8FF] px-5 py-5 sm:px-6">
                  {currentUser?.canComment ? (
                    <div className="grid gap-3">
                      <label className="grid gap-2 text-sm font-black text-[#061A3A]">
                        Přidat komentář
                        <textarea
                          className="min-h-28 rounded-2xl border border-[#D8E4F2] bg-white px-4 py-3 text-sm font-bold outline-none transition focus:border-[#0F4FA8] focus:ring-4 focus:ring-blue-100"
                          onChange={(event) => setCommentDrafts((current) => ({ ...current, [topic.id]: event.target.value }))}
                          value={commentDrafts[topic.id] ?? ""}
                        />
                      </label>
                      <div className="flex justify-end">
                        <button
                          className="rounded-full bg-[#EF233C] px-6 py-3 text-sm font-black text-white shadow-lg shadow-red-950/10 transition hover:-translate-y-0.5 hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={isSubmitting}
                          onClick={() => void handleAddComment(topic.id)}
                          type="button"
                        >
                          {isSubmitting ? "Ukládám..." : "Odeslat komentář"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm font-bold text-slate-600">Pro komentování je potřeba být přihlášený jako hráč nebo vyšší role.</p>
                  )}
                </div>
              </article>
            ))}
        </section>
      </section>

      <PublicFooter />
    </main>
  );
}
