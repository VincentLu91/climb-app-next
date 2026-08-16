create policy "Users can upload their own climbing media"
    on storage.objects
    for insert
    to authenticated
    with check (
        bucket_id = 'climbing-media'
        and (storage.foldername(name))[1] = (select auth.uid()::text)
    );

create policy "Users can read their own climbing media"
    on storage.objects
    for select
    to authenticated
    using (
        bucket_id = 'climbing-media'
        and owner_id = (select auth.uid()::text)
    );