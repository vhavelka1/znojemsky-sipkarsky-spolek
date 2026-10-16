"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type PublicUser = {
  displayName: string;
  role: string;
  isActive: boolean;
  canAccessAdmin: boolean;
  canManageOwnTeam: boolean;
};

export function usePublicUser() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    let sequence = 0;
    let controller: AbortController | undefined;
    // A stalled session refresh must not hide the login link indefinitely.
    const loadingDeadline = window.setTimeout(() => { if (mounted) setIsAuthLoading(false); }, 8000);

    async function loadUser(token: string | null) {
      const request = ++sequence;
      controller?.abort();
      const currentController = new AbortController();
      controller = currentController;
      try {
        let nextUser: PublicUser | null = null;
        if (token) {
          const response = await fetch("/api/auth/me", {
            cache: "no-store",
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.any([currentController.signal, AbortSignal.timeout(8000)]),
          });
          if (!response.ok) throw new Error("Account service unavailable");
          const body = await response.json() as { user?: PublicUser | null };
          nextUser = body.user ?? null;
        }
        if (mounted && request === sequence) setUser(nextUser);
      } catch {
        if (mounted && request === sequence) setUser(null);
      } finally {
        if (mounted && request === sequence) setIsAuthLoading(false);
      }
    }

    // The callback already supplies the session. Never re-enter getSession()
    // while Supabase is emitting an auth event under its internal lock.
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      void loadUser(session?.access_token ?? null);
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (mounted && sequence === 0) void loadUser(data.session?.access_token ?? null);
    }).catch(() => { if (mounted && sequence === 0) setIsAuthLoading(false); });

    return () => {
      mounted = false;
      controller?.abort();
      window.clearTimeout(loadingDeadline);
      data.subscription.unsubscribe();
    };
  }, []);

  return { user, isAuthLoading };
}
