create table public.chat_history (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  coaching_session_id uuid not null
    references public.coaching_sessions(id)
    on delete cascade,

  message text not null,

  sender text not null
    check (sender in ('User', 'ChatGPT')),

  created_at timestamptz not null default now()
);

alter table public.chat_history enable row level security;

create policy "Users can view own chat history"
on public.chat_history
for select
to authenticated
using (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.coaching_sessions
    where coaching_sessions.id = chat_history.coaching_session_id
      and coaching_sessions.user_id = (select auth.uid())
  )
);

create policy "Users can insert own chat history"
on public.chat_history
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.coaching_sessions
    where coaching_sessions.id = chat_history.coaching_session_id
      and coaching_sessions.user_id = (select auth.uid())
  )
);