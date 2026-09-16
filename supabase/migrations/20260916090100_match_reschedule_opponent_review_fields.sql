alter table public.match_reschedule_requests
  add column if not exists opponent_reviewed_by_user_id uuid references auth.users(id) on delete restrict,
  add column if not exists opponent_reviewed_at timestamptz,
  add column if not exists opponent_review_note text;

drop index if exists public.match_reschedule_requests_pending_match_uidx;

create unique index if not exists match_reschedule_requests_active_match_uidx
  on public.match_reschedule_requests (match_id)
  where status in ('opponent_pending', 'pending') and deleted_at is null;

drop policy if exists "Captains can create own match reschedule requests" on public.match_reschedule_requests;
create policy "Captains can create own match reschedule requests"
  on public.match_reschedule_requests for insert
  with check (
    status = 'opponent_pending'
    and reviewed_by_user_id is null
    and reviewed_at is null
    and opponent_reviewed_by_user_id is null
    and opponent_reviewed_at is null
    and deleted_at is null
    and exists (
      select 1
      from public.matches matched
      join public.team_memberships membership
        on membership.team_season_id in (matched.home_team_id, matched.away_team_id)
      join public.players player on player.id = membership.player_id
      where matched.id = match_id
        and matched.deleted_at is null
        and membership.player_id = requested_by_player_id
        and membership.member_role in ('captain', 'assistant_captain')
        and membership.left_on is null
        and membership.deleted_at is null
        and player.user_id = auth.uid()
    )
  );

notify pgrst, 'reload schema';
