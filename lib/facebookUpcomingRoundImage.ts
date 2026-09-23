import * as React from "react";
import { ImageResponse } from "next/og";
import {
  type FacebookGroupRound,
  type FacebookImageKind,
  type FacebookPostImage,
  type FacebookRoundMatch,
  type FacebookRoundPayload,
  type FacebookTeam,
} from "@/lib/facebookUpcomingRound";
import { type StandingRow } from "@/lib/leagueStandings";

const h = React.createElement;

type ImageSelection = {
  groupId?: string | null;
  kind?: FacebookImageKind | null;
};

function absoluteUrl(origin: string, url: string | null) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `${origin}${url.startsWith("/") ? url : `/${url}`}`;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("cs-CZ", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    timeZone: "Europe/Prague",
  }).format(new Date(value));
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat("cs-CZ", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Prague",
  }).format(new Date(value));
}

function compactNameSize(name: string) {
  if (name.length > 32) return 22;
  if (name.length > 24) return 25;
  return 28;
}

function teamLogo(team: FacebookTeam, origin: string, size = 82) {
  const logoUrl = absoluteUrl(origin, team.logoUrl);

  return h(
    "div",
    {
      style: {
        width: size,
        height: size,
        borderRadius: 20,
        background: "#FFFFFF",
        border: "3px solid #D8E4F2",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        flexShrink: 0,
      },
    },
    logoUrl
      ? h("img", {
          src: logoUrl,
          alt: "",
          style: {
            width: size - 12,
            height: size - 12,
            objectFit: "contain",
          },
        })
      : h(
          "span",
          {
            style: {
              fontSize: Math.max(20, size / 3),
              fontWeight: 900,
              color: "#0B2F6B",
            },
          },
          initials(team.name),
        ),
  );
}

function teamBlock(team: FacebookTeam, origin: string, align: "left" | "right") {
  return h(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 16,
        width: 350,
        flexDirection: align === "right" ? "row-reverse" : "row",
      },
    },
    teamLogo(team, origin),
    h(
      "div",
      {
        style: {
          color: "#061A3A",
          fontSize: compactNameSize(team.name),
          fontWeight: 900,
          lineHeight: 1.08,
          textAlign: align,
          flex: 1,
        },
      },
      team.name,
    ),
  );
}

function shell({
  children,
  eyebrow,
  groupName,
  leagueName,
  roundNumber,
}: {
  children: React.ReactNode;
  eyebrow: string;
  groupName: string;
  leagueName: string;
  roundNumber: number | null;
}) {
  return h(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "#F4F8FF",
        color: "#061A3A",
        padding: 52,
        position: "relative",
        fontFamily: "Arial, sans-serif",
      },
    },
    h("div", {
      style: {
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        height: 22,
        background: "#EF233C",
      },
    }),
    h(
      "div",
      {
        style: {
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 32,
        },
      },
      h(
        "div",
        { style: { display: "flex", flexDirection: "column" } },
        h(
          "div",
          {
            style: {
              color: "#EF233C",
              fontSize: 28,
              fontWeight: 900,
              letterSpacing: 1.5,
            },
          },
          eyebrow,
        ),
        h(
          "div",
          {
            style: {
              marginTop: 10,
              color: "#061A3A",
              fontSize: 52,
              fontWeight: 900,
              lineHeight: 1,
            },
          },
          roundNumber ? `${roundNumber}. KOLO` : "KOLO",
        ),
        h(
          "div",
          {
            style: {
              marginTop: 14,
              fontSize: 28,
              fontWeight: 900,
              color: "#0B2F6B",
            },
          },
          groupName,
        ),
        h(
          "div",
          {
            style: {
              marginTop: 8,
              fontSize: 22,
              fontWeight: 800,
              color: "#0B2F6B",
            },
          },
          leagueName,
        ),
      ),
      h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            color: "#0B2F6B",
            fontSize: 24,
            fontWeight: 900,
            lineHeight: 1.15,
          },
        },
        h("div", null, "ZNOJEMSKÝ"),
        h("div", null, "ŠIPKAŘSKÝ SPOLEK"),
      ),
    ),
    children,
  );
}

function emptyBox(text: string) {
  return h(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 360,
        borderRadius: 28,
        background: "#FFFFFF",
        border: "3px solid #D8E4F2",
        color: "#0B2F6B",
        fontSize: 34,
        fontWeight: 900,
        textAlign: "center",
      },
    },
    text,
  );
}

function scheduleRow(match: FacebookRoundMatch, origin: string) {
  return h(
    "div",
    {
      key: match.id,
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "#FFFFFF",
        border: "3px solid #D8E4F2",
        borderRadius: 26,
        padding: "14px 20px",
        minHeight: 118,
      },
    },
    teamBlock(match.homeTeam, origin, "left"),
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: 142,
          flexShrink: 0,
        },
      },
      h("div", { style: { color: "#EF233C", fontSize: 34, fontWeight: 900 } }, "VS"),
      h(
        "div",
        {
          style: {
            marginTop: 7,
            color: "#0B2F6B",
            fontSize: 19,
            fontWeight: 900,
            textAlign: "center",
            lineHeight: 1.15,
          },
        },
        `${dateLabel(match.scheduledAt)} • ${timeLabel(match.scheduledAt)}`,
      ),
    ),
    teamBlock(match.awayTeam, origin, "right"),
  );
}

function resultRow(match: FacebookRoundMatch, origin: string) {
  const score = match.result ? `${match.result.homePoints} : ${match.result.awayPoints}` : "- : -";

  return h(
    "div",
    {
      key: match.id,
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "#FFFFFF",
        border: "3px solid #D8E4F2",
        borderRadius: 26,
        padding: "14px 20px",
        minHeight: 112,
      },
    },
    teamBlock(match.homeTeam, origin, "left"),
    h(
      "div",
      {
        style: {
          width: 150,
          color: "#EF233C",
          fontSize: 38,
          fontWeight: 900,
          textAlign: "center",
          flexShrink: 0,
        },
      },
      score,
    ),
    teamBlock(match.awayTeam, origin, "right"),
  );
}

function byesBox(byes: FacebookTeam[]) {
  if (byes.length === 0) return null;

  return h(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 22,
        background: "#061A3A",
        color: "#FFFFFF",
        padding: "14px 22px",
        fontSize: 22,
        fontWeight: 900,
        lineHeight: 1.18,
        textAlign: "center",
        width: "100%",
        minHeight: 66,
        flexShrink: 0,
      },
    },
    `VOLNO: ${byes.map((team) => team.name).join(", ")}`,
  );
}

function renderSchedule(payload: FacebookRoundPayload, groupRound: FacebookGroupRound, origin: string) {
  const shownMatches = groupRound.matches.slice(0, groupRound.byes.length > 0 ? 5 : 6);

  return shell({
    eyebrow: "LIGOVÝ PROGRAM",
    groupName: groupRound.group.name,
    leagueName: payload.selectedLeague?.name ?? "",
    roundNumber: payload.selections.roundNumber,
    children: h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          gap: 16,
          marginTop: 34,
          flex: 1,
          width: "100%",
        },
      },
      h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            gap: 14,
            flex: 1,
          },
        },
        shownMatches.length > 0
          ? shownMatches.map((match) => scheduleRow(match, origin))
          : emptyBox("Pro vybrané kolo nejsou zadané zápasy."),
      ),
      byesBox(groupRound.byes),
    ),
  });
}

function renderResults(payload: FacebookRoundPayload, groupRound: FacebookGroupRound, origin: string) {
  const shownMatches = groupRound.matches.slice(0, 7);

  return shell({
    eyebrow: "VÝSLEDKY KOLA",
    groupName: groupRound.group.name,
    leagueName: payload.selectedLeague?.name ?? "",
    roundNumber: payload.selections.roundNumber,
    children: h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          gap: 13,
          marginTop: 34,
          flex: 1,
        },
      },
      shownMatches.length > 0
        ? shownMatches.map((match) => resultRow(match, origin))
        : emptyBox("Pro vybrané kolo nejsou zadané výsledky."),
    ),
  });
}

function tableHeader() {
  const cell = (text: string, width: number, align: "left" | "right" = "right") =>
    h("div", { style: { width, textAlign: align, fontSize: 19, fontWeight: 900 } }, text);

  return h(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "0 18px 8px",
        color: "#0B2F6B",
      },
    },
    cell("#", 42, "left"),
    cell("TÝM", 420, "left"),
    cell("Z", 46),
    cell("V", 46),
    cell("R", 46),
    cell("P", 46),
    cell("SKÓRE", 118),
    cell("BODY", 74),
  );
}

function tableRow(row: StandingRow, index: number, origin: string) {
  const team: FacebookTeam = {
    teamSeasonId: row.teamSeasonId,
    name: row.teamName,
    logoUrl: row.logoUrl,
    venue: null,
  };
  const draws = row.played - row.wins - row.losses;
  const cell = (text: string | number, width: number, align: "left" | "right" = "right", color = "#061A3A") =>
    h("div", { style: { width, textAlign: align, fontSize: 24, fontWeight: 900, color } }, String(text));

  return h(
    "div",
    {
      key: row.teamSeasonId,
      style: {
        display: "flex",
        alignItems: "center",
        gap: 12,
        borderRadius: 18,
        background: "#FFFFFF",
        border: "2px solid #D8E4F2",
        padding: "10px 18px",
        minHeight: 70,
      },
    },
    cell(`${index + 1}.`, 42, "left", "#EF233C"),
    h(
      "div",
      { style: { width: 420, display: "flex", alignItems: "center", gap: 12 } },
      teamLogo(team, origin, 48),
      h(
        "div",
        {
          style: {
            color: "#061A3A",
            fontSize: row.teamName.length > 30 ? 20 : 24,
            fontWeight: 900,
            lineHeight: 1.05,
          },
        },
        row.teamName,
      ),
    ),
    cell(row.played, 46),
    cell(row.wins, 46),
    cell(draws, 46),
    cell(row.losses, 46),
    cell(`${row.matchScoreFor}:${row.matchScoreAgainst}`, 118),
    cell(row.points, 74, "right", "#EF233C"),
  );
}

function renderStandings(payload: FacebookRoundPayload, groupRound: FacebookGroupRound, origin: string) {
  const rows = groupRound.standings.slice(0, 10);

  return shell({
    eyebrow: "AKTUÁLNÍ TABULKA",
    groupName: groupRound.group.name,
    leagueName: payload.selections.roundNumber ? `po ${payload.selections.roundNumber}. kole` : payload.selectedLeague?.name ?? "",
    roundNumber: payload.selections.roundNumber,
    children: h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          gap: 9,
          marginTop: 34,
          flex: 1,
        },
      },
      tableHeader(),
      rows.length > 0
        ? rows.map((row, index) => tableRow(row, index, origin))
        : emptyBox("Tabulka zatím není dostupná."),
    ),
  });
}

export function resolveFacebookPostImage(
  payload: FacebookRoundPayload,
  selection: ImageSelection = {},
): FacebookPostImage | null {
  return (
    payload.images.find(
      (image) =>
        (!selection.groupId || image.groupId === selection.groupId) &&
        (!selection.kind || image.kind === selection.kind),
    ) ??
    payload.images[0] ??
    null
  );
}

export function createFacebookUpcomingRoundImageResponse(
  payload: FacebookRoundPayload,
  origin: string,
  selection: ImageSelection = {},
) {
  const image = resolveFacebookPostImage(payload, selection);
  const groupRound = payload.selectedGroups.find((item) => item.group.id === image?.groupId) ?? payload.selectedGroups[0];
  const content =
    image?.kind === "results"
      ? renderResults(payload, groupRound, origin)
      : image?.kind === "standings"
        ? renderStandings(payload, groupRound, origin)
        : renderSchedule(payload, groupRound, origin);

  return new ImageResponse(content, {
    width: 1080,
    height: 1080,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function renderFacebookUpcomingRoundPng(
  payload: FacebookRoundPayload,
  origin: string,
  selection: ImageSelection = {},
) {
  const response = createFacebookUpcomingRoundImageResponse(payload, origin, selection);
  return response.blob();
}
