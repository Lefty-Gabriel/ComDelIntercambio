-- Perfil editable y avatares persistentes.
-- Los binarios viven en Storage; la tabla conserva solo la URL.

alter table iam.profiles
  add column if not exists title text not null default '',
  add column if not exists company text not null default '',
  add column if not exists phone text not null default '',
  add column if not exists location text not null default '',
  add column if not exists linkedin text not null default '',
  add column if not exists website text not null default '',
  add column if not exists bio text not null default '',
  add column if not exists avatar_url text not null default '';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-avatars',
  'profile-avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
