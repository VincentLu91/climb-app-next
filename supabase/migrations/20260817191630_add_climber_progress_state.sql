create table public.climber_progress_state (
  user_id uuid primary key
    references auth.users(id)
    on delete cascade,

  active_limiter text,
  progress_note text,
  current_experiment text,
  next_attempt_test text,

  updated_at timestamptz not null default now()
);

alter table public.climber_progress_state enable row level security;

create policy "Users can view own progress state"
on public.climber_progress_state
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert own progress state"
on public.climber_progress_state
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update own progress state"
on public.climber_progress_state
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);