# Brand guide – Znojemský šipkařský spolek

## Směr vizuálu

Aplikace má působit moderně, klubově a sportovně, ale ne agresivně. Vizuál vychází z modernizované minimalistické varianty loga:

- štít
- stylizovaný orel bez oka
- šipkový terč
- pastelová modrá a korálová
- tmavě modrá pro texty a kontrast
- jednoduchý nápis pod znakem
- spodní ozdobná šipka má být špičatá, protože se hraje steel darts

## Jazyk

Veškerý uživatelský text musí být česky.

Kód, proměnné, typy, API cesty a názvy databázových tabulek zůstávají anglicky.

## Barvy

Doporučená paleta:

```css
--brand-navy: #23364D;
--brand-blue: #6B8FBF;
--brand-light-blue: #B7CCE8;
--brand-coral: #E07A7A;
--brand-soft-coral: #F3B6B6;
--brand-cream: #F7F4EE;
--brand-gold: #E2C57A;
--brand-white: #FFFFFF;
--brand-slate: #0F172A;
```

Použití:

- hlavní texty: `--brand-navy`
- primární tlačítka: `--brand-navy`
- aktivní navigace: `--brand-navy` nebo `--brand-blue`
- akcenty: `--brand-coral`
- upozornění/vítězové/aktivní stav: `--brand-gold`
- pozadí aplikace: `--brand-cream` nebo velmi světlá modrá
- karty: bílá
- linky a rámečky: světle modrá

## Typografie

Doporučené fonty:

- primárně: Inter, Manrope nebo Poppins
- nadpisy: výrazný semibold/bold
- texty: dobře čitelné, bezpatkové

## UI styl

Admin:

- světlé pozadí
- čisté bílé karty
- levé admin menu
- výrazný aktivní stav položky
- zaoblené rohy
- jemné stíny
- dobrý kontrast

Veřejný web:

- může být výraznější
- hero sekce s logem
- tmavě modré plochy
- karty zápasů
- tabulky ligy
- live obrazovky

## Komponenty

Vytvořit nebo sjednotit:

- `Button`
- `Card`
- `PageHeader`
- `AdminLayout`
- `AdminNav`
- `Badge`
- `StatCard`
- `Table`
- `FormField`

## Logo

Použít dočasně soubor v `public/brand/logo-placeholder.svg`, nebo vložit finální logo později jako:

```text
public/brand/logo.svg
public/brand/logo-mark.svg
public/brand/logo-white.svg
```

Logo v UI nemá být příliš velké. V adminu stačí menší znak + text „ZŠS“.

## Zásady

- neměnit databázové schéma
- neměnit `.env.local`
- nepřidávat auth
- nepoužívat anglické texty v UI
- zachovat existující API
- zachovat funkčnost admin stránek
