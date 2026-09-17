"use client";

import { supabase } from "@/lib/supabase";

async function currentAccessToken() {
  const { data } = await supabase.auth.getSession();
  if (data.session?.access_token) {
    return data.session.access_token;
  }

  const { data: refreshed } = await supabase.auth.refreshSession().catch(() => ({ data: { session: null } }));
  return refreshed.session?.access_token ?? null;
}

export async function adminFetch(input: RequestInfo | URL, init?: RequestInit) {
  const token = await currentAccessToken();
  const headers = new Headers(init?.headers);

  if (!token) {
    return Response.json({ error: "Pro tuto akci se nejprve přihlaste." }, { status: 401 });
  }

  headers.set("Authorization", `Bearer ${token}`);

  return fetch(input, {
    ...init,
    headers,
  });
}
