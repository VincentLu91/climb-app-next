alter table public.analyses enable row level security;
alter table public.profiles enable row level security;
alter table public.uploads enable row level security;

create policy "Users can view own profile"
    on public.profiles
    for select
    to authenticated
    using ((select auth.uid()) = id);

create policy "Users can insert own profile"
    on public.profiles
    for insert
    to authenticated
    with check ((select auth.uid()) = id);

create policy "Users can update own profile"
    on public.profiles
    for update
    to authenticated
    using ((select auth.uid()) = id)
    with check ((select auth.uid()) = id);

create policy "Users can view own uploads"
    on public.uploads
    for select
    to authenticated
    using ((select auth.uid()) = user_id);

create policy "Users can insert own uploads"
    on public.uploads
    for insert
    to authenticated
    with check ((select auth.uid()) = user_id);

create policy "Users can update own uploads"
    on public.uploads
    for update
    to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

create policy "Users can view analyses for own uploads"
    on public.analyses
    for select
    to authenticated
    using (
        exists (
            select 1
            from public.uploads
            where uploads.id = analyses.upload_id
              and uploads.user_id = (select auth.uid())
        )
    );