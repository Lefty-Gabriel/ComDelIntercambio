alter table courses.courses add column if not exists thumbnail_url text;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('course-covers','course-covers',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
notify pgrst, 'reload schema';
