export const bundledTeamLogoUrls: Record<string, string> = {
  "aligatori-kucharovice": "/team-logos/aligatori.png",
  "beny-club": "/team-logos/beny-club.png",
  "dc-dikobrazi-olbramovice": "/team-logos/dc-dikobrazi-olbramovice.png",
  "dc-draci-resice": "/team-logos/dc-draci-resice.png",
  "dc-fretky-rosice": "/team-logos/dc-fretky-rosice.png",
  "dc-jezci-moravsky-krumlov": "/team-logos/dc-jezci-mor-krumlov.png",
  "dc-kohouti-mackovice": "/team-logos/dc-kohouti-mackovice.png",
  "dc-krakeni-hrusovany-nad-jevisovkou": "/team-logos/dc-krakeni.png",
  "dc-medvedi-chvalovice": "/team-logos/dc-medvedi-chvalovice.png",
  "dc-orli": "/team-logos/dc-orli.png",
  "dc-rafani-hodonice": "/team-logos/dc-rafani-hodonice.png",
  "dc-rytiri": "/team-logos/dc-rytiri.png",
  "dc-sklipkani-sanov": "/team-logos/dc-sklipkani-sanov.png",
  "dc-sloni-ivancice": "/team-logos/dc-sloni-ivancice.png",
  "dc-srsni-vemyslice": "/team-logos/dc-srsni-vemyslice.png",
  "dc-vlci": "/team-logos/dc-vlci.png",
  "loofci-moravske-budejovice": "/team-logos/loofci-mor-budejovice.png",
  "lukovsti-dravci": "/team-logos/lukovsti-dravci.png",
  "octopus-kridluvky": "/team-logos/oktopus-kridluvky.png",
};

export function teamLogoUrl(slug: string, storedLogoUrl?: string | null) {
  return storedLogoUrl ?? bundledTeamLogoUrls[slug] ?? null;
}
