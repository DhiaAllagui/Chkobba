-- ═══════════════════════════════════════════════════════════════════════════
-- Run ONCE in Supabase: SQL Editor → New query → paste this file → Run
-- Sign-up uses your Node server + service_role (admin.createUser) — no emails.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  email text not null unique,
  avatar_url text default '',
  total_elo integer not null default 1000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.waiting_players (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting', 'matched', 'cancelled', 'expired')),
  game_session_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  player1_id uuid not null references public.profiles(id) on delete cascade,
  player2_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'matched' check (status in ('matched', 'in_progress', 'finished', 'cancelled')),
  room_code text null,
  winner_id uuid null references public.profiles(id),
  loser_id uuid null references public.profiles(id),
  ended_reason text null,
  created_at timestamptz not null default now(),
  ended_at timestamptz null
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'waiting_players_game_session_fk'
  ) then
    alter table public.waiting_players
      add constraint waiting_players_game_session_fk
      foreign key (game_session_id) references public.game_sessions(id) on delete set null;
  end if;
end $$;

create table if not exists public.match_history (
  match_id uuid primary key default gen_random_uuid(),
  game_session_id uuid null references public.game_sessions(id) on delete set null,
  player_id uuid not null references public.profiles(id) on delete cascade,
  opponent_id uuid not null references public.profiles(id) on delete cascade,
  player_score integer not null check (player_score >= 0),
  opponent_score integer not null check (opponent_score >= 0),
  chkobba_count integer not null default 0 check (chkobba_count >= 0),
  match_result text not null check (match_result in ('win', 'loss')),
  created_at timestamptz not null default now()
);

create index if not exists idx_waiting_players_status_created on public.waiting_players(status, created_at);
create index if not exists idx_match_history_player_created on public.match_history(player_id, created_at desc);
create index if not exists idx_profiles_total_elo on public.profiles(total_elo desc);

do $$
begin
  alter publication supabase_realtime add table public.waiting_players;
exception
  when others then
    if sqlerrm not like '%already member%' and sqlerrm not like '%already exists%' then
      raise;
    end if;
end $$;

alter table public.profiles enable row level security;
alter table public.waiting_players enable row level security;
alter table public.game_sessions enable row level security;
alter table public.match_history enable row level security;

drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all"
on public.profiles for select
using (true);

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self"
on public.profiles for insert
with check (auth.uid() = id);

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "waiting_self_manage" on public.waiting_players;
create policy "waiting_self_manage"
on public.waiting_players for all
using (auth.uid() = player_id)
with check (auth.uid() = player_id);

drop policy if exists "game_sessions_participant_read" on public.game_sessions;
create policy "game_sessions_participant_read"
on public.game_sessions for select
using (auth.uid() = player1_id or auth.uid() = player2_id);

drop policy if exists "match_history_owner_read" on public.match_history;
create policy "match_history_owner_read"
on public.match_history for select
using (auth.uid() = player_id);
