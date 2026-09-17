import * as React from "react";
import { ImageResponse } from "next/og";
import { type FacebookRoundPayload, type FacebookTeam } from "@/lib/facebookUpcomingRound";

const h = React.createElement;

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

function teamLogo(team: FacebookTeam, origin: string) {
  const logoUrl = absoluteUrl(origin, team.logoUrl);

  return h(
    "div",
    {
      style: {
        width: 94,
        height: 94,
        borderRadius: 22,
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
            width: 82,
            height: 82,
            objectFit: "contain",
          },
        })
      : h(
          "span",
          {
            style: {
              fontSize: 28,
              fontWeight: 900,
              color: "#0B2F6B",
            },
          },
          initials(team.name),
        ),
  );
}

function teamBlock(team: FacebookTeam, origin: string, align: "left" | "right") {
  const content = [
    teamLogo(team, origin),
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          flex: 1,
        },
      },
      h(
        "div",
        {
          style: {
            color: "#061A3A",
            fontSize: team.name.length > 24 ? 26 : 30,
            fontWeight: 900,
            lineHeight: 1.08,
            textAlign: align,
          },
        },
        team.name,
      ),
    ),
  ];

  return h(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 18,
        width: 370,
        flexDirection: align === "right" ? "row-reverse" : "row",
      },
    },
    ...content,
  );
}

export function createFacebookUpcomingRoundImageResponse(
  payload: FacebookRoundPayload,
  origin: string,
) {
  const heading = payload.selections.roundNumber
    ? `${payload.selections.roundNumber}. KOLO - ${payload.selectedGroup?.name ?? "SKUPINA"}`
    : payload.selectedGroup?.name ?? "PROGRAM";
  const shownMatches = payload.matches.slice(0, 6);

  return new ImageResponse(
    h(
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
          {
            style: {
              display: "flex",
              flexDirection: "column",
            },
          },
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
            "LIGOVY PROGRAM",
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
            heading,
          ),
          h(
            "div",
            {
              style: {
                marginTop: 14,
                fontSize: 24,
                fontWeight: 800,
                color: "#0B2F6B",
              },
            },
            payload.selectedLeague?.name ?? "",
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
          h("div", null, "ZNOJEMSKY"),
          h("div", null, "SIPKARSKY SPOLEK"),
        ),
      ),
      h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            gap: 16,
            marginTop: 42,
            flex: 1,
          },
        },
        shownMatches.length > 0
          ? shownMatches.map((match) =>
              h(
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
                    padding: "16px 22px",
                    minHeight: 126,
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
                      width: 130,
                      flexShrink: 0,
                    },
                  },
                  h(
                    "div",
                    {
                      style: {
                        color: "#EF233C",
                        fontSize: 34,
                        fontWeight: 900,
                      },
                    },
                    "VS",
                  ),
                  h(
                    "div",
                    {
                      style: {
                        marginTop: 7,
                        color: "#0B2F6B",
                        fontSize: 20,
                        fontWeight: 900,
                        textAlign: "center",
                        lineHeight: 1.15,
                      },
                    },
                    `${dateLabel(match.scheduledAt)} - ${timeLabel(match.scheduledAt)}`,
                  ),
                ),
                teamBlock(match.awayTeam, origin, "right"),
              ),
            )
          : h(
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
                },
              },
              "Pro vybrane kolo nejsou zadane zapasy.",
            ),
      ),
      payload.byes.length > 0
        ? h(
            "div",
            {
              style: {
                display: "flex",
                alignItems: "center",
                gap: 12,
                borderRadius: 22,
                background: "#061A3A",
                color: "#FFFFFF",
                padding: "18px 24px",
                fontSize: 28,
                fontWeight: 900,
              },
            },
            `VOLNO: ${payload.byes.map((team) => team.name).join(", ")}`,
          )
        : null,
    ),
    {
      width: 1080,
      height: 1080,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function renderFacebookUpcomingRoundPng(
  payload: FacebookRoundPayload,
  origin: string,
) {
  const response = createFacebookUpcomingRoundImageResponse(payload, origin);
  return response.blob();
}
