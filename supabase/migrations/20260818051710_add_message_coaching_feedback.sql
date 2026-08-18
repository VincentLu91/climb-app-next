alter table public.chat_history
add column coaching_helpful boolean,
add column coaching_feedback_at timestamptz;

create policy "Users can update own chat history"
on public.chat_history
for update
to authenticated
using (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.coaching_sessions
    where coaching_sessions.id = chat_history.coaching_session_id
      and coaching_sessions.user_id = (select auth.uid())
  )
)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.coaching_sessions
    where coaching_sessions.id = chat_history.coaching_session_id
      and coaching_sessions.user_id = (select auth.uid())
  )
);