-- Run this in Supabase SQL Editor to update leaderboard ranking logic.
-- Finished paintings rank above unfinished runs.
-- Among finishes: rank by total blocks (painting size).
-- Among unfinished: rank by blocks painted.

drop function if exists public.get_score_rank(integer, integer, timestamptz);

drop index if exists public.scores_leaderboard_idx;

create index scores_leaderboard_idx
  on public.scores (completed desc, total desc, clicked desc, created_at desc);

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

grant execute on function public.get_score_rank(boolean, integer, integer, timestamptz) to anon, authenticated;
