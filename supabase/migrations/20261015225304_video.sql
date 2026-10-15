-- ============================================================================
-- Traction - modulo video (VOD)
-- Los archivos viven en Supabase Storage (bucket privado), NUNCA en la DB.
-- La DB solo guarda metadata + vencimiento (retencion).
-- ============================================================================

create schema if not exists video;

grant usage on schema video to anon, authenticated, service_role;

create table video.videos (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses.courses (id) on delete cascade,
  title text not null,
  description text not null default '',
  storage_path text not null unique,
  mime_type text not null default 'video/mp4',
  size_bytes bigint not null default 0,
  duration_seconds integer,
  status text not null default 'pending',
  created_by uuid references iam.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz
);

create index video_videos_course_id_idx on video.videos (course_id);
create index video_videos_expires_at_idx on video.videos (expires_at);

-- Estado permitido
alter table video.videos
  add constraint video_videos_status_check
  check (status in ('pending', 'ready', 'error'));

grant all on all tables in schema video to service_role;
grant select on all tables in schema video to authenticated;

-- Bucket privado para videos de curso (limite 2 GiB por objeto)
insert into storage.buckets (id, name, public, file_size_limit)
values ('course-videos', 'course-videos', false, 2147483648)
on conflict (id) do nothing;
