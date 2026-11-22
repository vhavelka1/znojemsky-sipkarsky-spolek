import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// The roster operation has already committed; notification errors must not undo it.
export async function sendRosterApprovalEmail(id: string, event: "created" | "approved", reviewer?: string) {
  try {
    const { RESEND_API_KEY: key, APPROVAL_EMAIL_FROM: from, APP_URL: origin } = process.env;
    if (!key || !from || !origin) throw new Error("Chybí RESEND_API_KEY, APPROVAL_EMAIL_FROM nebo APP_URL.");
    const base = new URL(origin);
    if (base.protocol !== "https:") throw new Error("APP_URL musí používat HTTPS.");
    const db = createSupabaseAdminClient();
    const [roster, profiles] = await Promise.all([
      db.from("team_roster_requests").select("requested_player_name, requested_player_note, team_season_id").eq("id", id).is("deleted_at", null).single(),
      db.from("user_profiles").select("user_id").eq("is_active", true).in("app_role", ["admin", "moderator"]).is("deleted_at", null),
    ]);
    if (roster.error) throw roster.error;
    if (profiles.error) throw profiles.error;
    const { data: teamSeason, error: teamError } = await db.from("team_seasons").select("display_name, teams(name)").eq("id", roster.data.team_season_id).single();
    if (teamError) throw teamError;
    const team = teamSeason.display_name || (teamSeason.teams as unknown as { name: string } | null)?.name || "Tým";
    const recipients = await Promise.all((profiles.data ?? []).map(async ({ user_id }) => {
      const result = await db.auth.admin.getUserById(user_id);
      if (result.error) throw result.error;
      return result.data.user.app_metadata?.receive_approval_emails === true ? result.data.user.email : undefined;
    }));
    const emails = [...new Set(recipients.filter((email): email is string => Boolean(email)))];
    if (!emails.length) return;
    const url = new URL(`/admin/roster-requests#request-${encodeURIComponent(id)}`, base).toString();
    const title = event === "created" ? "Nová žádost o změnu soupisky" : "Žádost o změnu soupisky byla schválena";
    const detail = `${team}: ${roster.data.requested_player_name}`;
    const note = roster.data.requested_player_note || "";
    const reviewed = event === "approved" ? `Schválil(a): ${reviewer || "neznámý uživatel"}` : "";
    const text = [title, detail, note, reviewed, url].filter(Boolean).join("\n");
    const html = `<h2>${escapeHtml(title)}</h2><p>${escapeHtml(detail)}</p><p>${escapeHtml(note)}</p><p>${escapeHtml(reviewed)}</p><p><a href="${escapeHtml(url)}">${event === "created" ? "Otevřít žádost a schválit" : "Zobrazit žádost"}</a></p>`;
    const results = await Promise.all(emails.map((to) => fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject: title, text, html }), signal: AbortSignal.timeout(10000),
    })));
    if (results.some((response) => !response.ok)) throw new Error("Poskytovatel odmítl alespoň jeden e-mail.");
  } catch (error) {
    console.error("Oznámení o žádosti soupisky se nepodařilo odeslat:", error);
  }
}
