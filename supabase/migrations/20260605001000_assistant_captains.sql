alter type public.membership_role add value if not exists 'assistant_captain';

create index if not exists team_memberships_active_assistant_captain_idx
  on public.team_memberships (team_season_id)
  where member_role::text = 'assistant_captain'
    and left_on is null
    and deleted_at is null;
