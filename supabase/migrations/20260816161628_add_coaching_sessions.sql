create table public.coaching_sessions (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  started_at timestamptz not null default now(),
  ended_at timestamptz
);

alter table public.uploads
add column coaching_session_id uuid
  references public.coaching_sessions(id)
  on delete set null;

alter table public.uploads
add column attempt_number integer;

alter table public.coaching_sessions enable row level security;

create policy "Users can view own coaching sessions"
on public.coaching_sessions
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert own coaching sessions"
on public.coaching_sessions
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update own coaching sessions"
on public.coaching_sessions
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);