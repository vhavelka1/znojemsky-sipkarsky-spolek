alter table public.teams
  add column if not exists logo_url text;

update public.teams
set logo_url = case slug
  when 'dc-fretky-rosice' then '/team-logos/dc-fretky-rosice.png'
  when 'dc-jezci-moravsky-krumlov' then '/team-logos/dc-jezci-mor-krumlov.png'
  when 'dc-rafani-hodonice' then '/team-logos/dc-rafani-hodonice.png'
  when 'loofci-moravske-budejovice' then '/team-logos/loofci-mor-budejovice.png'
  when 'dc-sloni-ivancice' then '/team-logos/dc-sloni-ivancice.png'
  when 'beny-club' then '/team-logos/beny-club.png'
  when 'lukovsti-dravci' then '/team-logos/lukovsti-dravci.png'
  when 'dc-sklipkani-sanov' then '/team-logos/dc-sklipkani-sanov.png'
  when 'dc-srsni-vemyslice' then '/team-logos/dc-srsni-vemyslice.png'
  when 'dc-rytiri' then '/team-logos/dc-rytiri.png'
  when 'dc-draci-resice' then '/team-logos/dc-draci-resice.png'
  when 'dc-vlci' then '/team-logos/dc-vlci.png'
  when 'dc-orli' then '/team-logos/dc-orli.png'
  when 'dc-kohouti-mackovice' then '/team-logos/dc-kohouti-mackovice.png'
  when 'dc-medvedi-chvalovice' then '/team-logos/dc-medvedi-chvalovice.png'
  when 'dc-krakeni-hrusovany-nad-jevisovkou' then '/team-logos/dc-krakeni.png'
  when 'aligatori-kucharovice' then '/team-logos/aligatori.png'
  when 'dc-dikobrazi-olbramovice' then '/team-logos/dc-dikobrazi-olbramovice.png'
  when 'octopus-kridluvky' then '/team-logos/oktopus-kridluvky.png'
  else logo_url
end;
