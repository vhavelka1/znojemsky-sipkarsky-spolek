import { NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/appAuth";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { removeStoredTeamLogo, teamLogosBucket, teamLogoValidationError, uploadTeamLogo } from "@/lib/teamLogoStorage";

async function getCaptainTeamContext(request: Request) {
  const requester = await getCurrentUserProfile(request);
  if (!requester?.isActive) {
    return {
      response: NextResponse.json({ error: "Pro správu týmu se nejprve přihlaste." }, { status: 401 }),
      supabase: null,
      teamId: null,
    };
  }

  if (!requester.playerId) {
    return {
      response: NextResponse.json({ error: "Uživatel není propojený s hráčem." }, { status: 403 }),
      supabase: null,
      teamId: null,
    };
  }

  const supabase = createSupabaseAdminClient();
  const { data: membership, error: membershipError } = await supabase
    .from("team_memberships")
    .select("team_season_id")
    .eq("player_id", requester.playerId)
    .in("member_role", ["captain", "assistant_captain"])
    .is("left_on", null)
    .is("deleted_at", null)
    .maybeSingle<{ team_season_id: string }>();

  if (membershipError || !membership) {
    return {
      response: NextResponse.json({ error: "Logo může měnit pouze kapitán nebo zástupce kapitána týmu." }, { status: 403 }),
      supabase,
      teamId: null,
    };
  }

  const { data: teamSeason, error: teamSeasonError } = await supabase
    .from("team_seasons")
    .select("team_id")
    .eq("id", membership.team_season_id)
    .is("deleted_at", null)
    .single<{ team_id: string }>();

  if (teamSeasonError || !teamSeason) {
    return {
      response: NextResponse.json({ error: "Tým se nepodařilo načíst." }, { status: 500 }),
      supabase,
      teamId: null,
    };
  }

  return { response: null, supabase, teamId: teamSeason.team_id };
}

export async function POST(request: Request) {
  const context = await getCaptainTeamContext(request);
  if (context.response) return context.response;

  const formData = await request.formData();
  const logo = formData.get("logo");

  if (!(logo instanceof File)) {
    return NextResponse.json({ error: "Vyberte obrázek loga." }, { status: 400 });
  }

  const validationError = teamLogoValidationError(logo);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const { data: existingTeam, error: readError } = await context.supabase
    .from("teams")
    .select("id, name, slug, logo_url")
    .eq("id", context.teamId)
    .is("deleted_at", null)
    .single<{ id: string; name: string; slug: string; logo_url: string | null }>();

  if (readError || !existingTeam) {
    return NextResponse.json({ error: readError?.message ?? "Tým se nepodařilo načíst." }, { status: 500 });
  }

  let uploadedLogo: Awaited<ReturnType<typeof uploadTeamLogo>>;
  try {
    uploadedLogo = await uploadTeamLogo(context.supabase, existingTeam.id, logo);
  } catch (uploadError) {
    return NextResponse.json(
      { error: uploadError instanceof Error ? uploadError.message : "Logo se nepodařilo nahrát do Supabase." },
      { status: 500 },
    );
  }

  const { data: updatedTeam, error: updateError } = await context.supabase
    .from("teams")
    .update({ logo_url: uploadedLogo.publicUrl })
    .eq("id", existingTeam.id)
    .is("deleted_at", null)
    .select("id, name, slug, logo_url")
    .single<{ id: string; name: string; slug: string; logo_url: string | null }>();

  if (updateError || !updatedTeam) {
    await context.supabase.storage.from(teamLogosBucket).remove([uploadedLogo.storagePath]).catch(() => undefined);
    return NextResponse.json({ error: updateError?.message ?? "Logo se nepodařilo uložit." }, { status: 500 });
  }

  await removeStoredTeamLogo(context.supabase, existingTeam.logo_url);

  return NextResponse.json({
    team: {
      id: updatedTeam.id,
      name: updatedTeam.name,
      slug: updatedTeam.slug,
      logoUrl: updatedTeam.logo_url,
    },
  });
}
