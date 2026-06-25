import { SupabaseClient } from "@supabase/supabase-js";

export const teamLogosBucket = "team-logos";
export const maximumTeamLogoSize = 2 * 1024 * 1024;

const allowedTeamLogoTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export function teamLogoValidationError(file: File) {
  if (!allowedTeamLogoTypes.has(file.type)) {
    return "Logo musí být ve formátu PNG, JPG nebo WebP.";
  }

  if (file.size > maximumTeamLogoSize) {
    return "Logo může mít nejvýše 2 MB.";
  }

  return null;
}

export async function uploadTeamLogo(supabase: SupabaseClient, teamId: string, file: File) {
  const extension = allowedTeamLogoTypes.get(file.type);
  if (!extension) {
    throw new Error("Logo musí být ve formátu PNG, JPG nebo WebP.");
  }

  const storagePath = `${teamId}/${crypto.randomUUID()}.${extension}`;
  const uploadResult = await supabase.storage.from(teamLogosBucket).upload(storagePath, file, {
    cacheControl: "31536000",
    contentType: file.type,
    upsert: false,
  });

  if (uploadResult.error) {
    throw new Error(uploadResult.error.message);
  }

  return {
    publicUrl: supabase.storage.from(teamLogosBucket).getPublicUrl(storagePath).data.publicUrl,
    storagePath,
  };
}

export async function removeStoredTeamLogo(supabase: SupabaseClient, logoUrl: string | null | undefined) {
  const storagePath = storagePathFromPublicUrl(logoUrl);
  if (!storagePath) {
    return;
  }

  await supabase.storage.from(teamLogosBucket).remove([storagePath]).catch(() => undefined);
}

function storagePathFromPublicUrl(logoUrl: string | null | undefined) {
  if (!logoUrl) {
    return null;
  }

  const marker = `/storage/v1/object/public/${teamLogosBucket}/`;
  const markerIndex = logoUrl.indexOf(marker);
  if (markerIndex === -1) {
    return null;
  }

  return decodeURIComponent(logoUrl.slice(markerIndex + marker.length));
}
