"use client";

import { useEffect, useState } from "react";
import { PageHeader, StatCard } from "@/components/ui/admin";

type DashboardCounts = {
  players: number;
  teams: number;
  seasons: number;
  memberships: number;
};

const emptyCounts: DashboardCounts = {
  players: 0,
  teams: 0,
  seasons: 0,
  memberships: 0,
};

const dashboardCards = [
  { key: "players", label: "Počet hráčů" },
  { key: "teams", label: "Počet týmů" },
  { key: "seasons", label: "Počet sezón" },
  { key: "memberships", label: "Počet členství" },
] as const;

async function fetchDashboardCounts() {
  const response = await fetch("/api/admin/dashboard");
  const body = (await response.json().catch(() => ({}))) as {
    counts?: DashboardCounts;
    error?: string;
  };

  if (!response.ok) {
    throw new Error("Nepodařilo se načíst přehled.");
  }

  return body.counts ?? emptyCounts;
}

export default function AdminDashboardPage() {
  const [counts, setCounts] = useState<DashboardCounts>(emptyCounts);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    fetchDashboardCounts()
      .then((loadedCounts) => {
        if (!isMounted) {
          return;
        }

        setCounts(loadedCounts);
        setIsLoading(false);
      })
      .catch((loadError) => {
        if (!isMounted) {
          return;
        }

        setError(
          loadError instanceof Error ? loadError.message : "Nepodařilo se načíst přehled.",
        );
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        description="Rychlý přehled klubové administrace a soutěžních dat."
        title="Přehled"
      />

      {error ? <div className="text-sm text-red-700">{error}</div> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {dashboardCards.map((card) => (
          <StatCard
            key={card.key}
            label={card.label}
            value={isLoading ? "..." : counts[card.key]}
          />
        ))}
      </section>
    </div>
  );
}
