create policy "Users can insert analyses for own uploads"
on public.analyses
for insert
to authenticated
with check (
  exists (
    select 1
    from public.uploads
    where uploads.id = analyses.upload_id
      and uploads.user_id = (select auth.uid())
  )
);

create policy "Users can update analyses for own uploads"
on public.analyses
for update
to authenticated
using (
  exists (
    select 1
    from public.uploads
    where uploads.id = analyses.upload_id
      and uploads.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.uploads
    where uploads.id = analyses.upload_id
      and uploads.user_id = (select auth.uid())
  )
);