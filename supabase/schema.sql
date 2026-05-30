-- Mondrian Browsing — global multiplayer leaderboard
-- Run this in Supabase: SQL Editor → New query → Run

create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  player_name text not null check (char_length(player_name) between 1 and 32),
  clicked integer not null check (clicked >= 0),
  total integer not null check (total >= 0),
  completed boolean not null default false,
  page text,
  url text,
  created_at timestamptz not null default now()
);

create index if not exists scores_leaderboard_idx
  on public.scores (completed desc, total desc, clicked desc, created_at desc);

alter table public.scores enable row level security;

create policy "scores are readable by everyone"
  on public.scores
  for select
  using (true);

create policy "scores can be inserted by anyone"
  on public.scores
  for insert
  with check (true);

create or replace function public.get_score_rank(
  p_completed boolean,
  p_clicked integer,
  p_total integer,
  p_created_at timestamptz
)
returns integer
language sql
stable
as $$
  select count(*)::integer + 1
  from public.scores s
  where (s.completed and not p_completed)
     or (
       not s.completed
       and not p_completed
       and (
         s.clicked > p_clicked
         or (s.clicked = p_clicked and s.created_at > p_created_at)
       )
     )
     or (
       s.completed
       and p_completed
       and (
         s.total > p_total
         or (s.total = p_total and s.created_at > p_created_at)
       )
     );
$$;

grant usage on schema public to anon, authenticated;
grant select, insert on public.scores to anon, authenticated;
grant execute on function public.get_score_rank(boolean, integer, integer, timestamptz) to anon, authenticated;
