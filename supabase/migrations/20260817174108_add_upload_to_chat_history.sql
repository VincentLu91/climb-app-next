alter table public.chat_history
add column upload_id uuid references public.uploads(id) on delete set null;

drop policy "Users can insert own chat history"
on public.chat_history;

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
  and (
    upload_id is null
    or exists (
      select 1
      from public.uploads
      where uploads.id = chat_history.upload_id
        and uploads.user_id = (select auth.uid())
        and uploads.coaching_session_id = chat_history.coaching_session_id
    )
  )
);