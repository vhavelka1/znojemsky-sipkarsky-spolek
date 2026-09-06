"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const SESSION_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const LAST_ACTIVITY_KEY = "zss:last-auth-activity-at";
const ACTIVITY_EVENTS = ["click", "keydown", "pointerdown", "scroll", "touchstart"] as const;

function authenticatedRedirect(pathname: string) {
  return pathname.startsWith("/admin") || pathname.startsWith("/muj-tym") || pathname.startsWith("/muj-ucet");
}

export function SessionTimeoutManager() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    let isSignedIn = false;
    let isSigningOut = false;

    function markActivity() {
      if (!isSignedIn) {
        return;
      }

      window.localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
    }

    async function signOutForTimeout() {
      if (isSigningOut) {
        return;
      }

      isSigningOut = true;
      window.localStorage.removeItem(LAST_ACTIVITY_KEY);
      await supabase.auth.signOut();

      if (authenticatedRedirect(pathname)) {
        router.replace(`/prihlaseni?redirect=${encodeURIComponent(pathname)}`);
      } else {
        router.refresh();
      }
    }

    async function checkTimeout() {
      const { data } = await supabase.auth.getSession();
      isSignedIn = Boolean(data.session);

      if (!data.session) {
        window.localStorage.removeItem(LAST_ACTIVITY_KEY);
        return;
      }

      const lastActivity = Number(window.localStorage.getItem(LAST_ACTIVITY_KEY));
      if (!Number.isFinite(lastActivity) || lastActivity <= 0) {
        markActivity();
        return;
      }

      if (Date.now() - lastActivity >= SESSION_TIMEOUT_MS) {
        await signOutForTimeout();
      }
    }

    void checkTimeout();
    const timeoutCheckId = window.setInterval(() => {
      void checkTimeout();
    }, 60 * 1000);

    ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, markActivity, { passive: true });
    });

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      isSignedIn = Boolean(session);

      if (event === "SIGNED_IN") {
        window.localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
      }

      if (event === "SIGNED_OUT") {
        window.localStorage.removeItem(LAST_ACTIVITY_KEY);
      }
    });

    return () => {
      window.clearInterval(timeoutCheckId);
      ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, markActivity);
      });
      data.subscription.unsubscribe();
    };
  }, [pathname, router]);

  return null;
}
