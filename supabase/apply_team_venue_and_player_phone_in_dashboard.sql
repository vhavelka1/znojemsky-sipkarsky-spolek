-- Run this once in Supabase Dashboard > SQL Editor to add team venue and player phone fields.

alter table public.teams
  add column if not exists playing_venue_address text;

alter table public.players
  add column if not exists phone text;
