alter table public.team_registration_requests
  add column if not exists assistant_captain_name text,
  add column if not exists assistant_captain_email text,
  add column if not exists assistant_captain_phone text,
  add column if not exists captain_address text,
  add column if not exists captain_date_of_birth date,
  add column if not exists assistant_captain_address text,
  add column if not exists assistant_captain_date_of_birth date,
  add column if not exists wants_major_tournament boolean not null default false;

alter table public.team_registration_players
  add column if not exists address text,
  add column if not exists date_of_birth date;

insert into public.app_settings (key, value)
values (
  'team_registration_intro',
  'Formulář pro registraci týmu do Znojemské šipkařské týmové ligy pro sezonu 2026/2027.

Registrační poplatek na sezonu je stanoven na 1500 Kč. Uhrazení proběhne na účet Znojemského šipkařského spolku. Do poznámky pro příjemce uvést název týmu.
Č. účtu: 246898551
Kód banky: 0/600

Termín odevzdání přihlášek je stanoven na 31. 7. 2026'
)
on conflict (key) do nothing;
