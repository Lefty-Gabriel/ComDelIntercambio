-- Student lesson content and private downloadable resources.

alter table courses.lessons
  add column content_text text not null default '';

create table courses.lesson_resources (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references courses.lessons (id) on delete cascade,
  title text not null,
  description text not null default '',
  kind text not null default 'download',
  resource_type text not null default 'document',
  storage_path text,
  external_url text,
  mime_type text,
  size_bytes bigint,
  position integer not null default 0,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lesson_resources_kind_check
    check (kind in ('download', 'complementary')),
  constraint lesson_resources_type_check
    check (
      resource_type in (
        'document',
        'spreadsheet',
        'presentation',
        'image',
        'archive',
        'link',
        'audio',
        'other'
      )
    ),
  constraint lesson_resources_size_non_negative
    check (size_bytes is null or size_bytes >= 0),
  constraint lesson_resources_source_check
    check (
      (
        storage_path is not null
        and length(trim(storage_path)) > 0
        and external_url is null
      )
      or
      (
        external_url is not null
        and length(trim(external_url)) > 0
        and storage_path is null
      )
    ),
  unique (storage_path)
);

create index lesson_resources_lesson_position_idx
  on courses.lesson_resources (lesson_id, position);

alter table courses.lesson_resources enable row level security;

revoke all on courses.lesson_resources from public, anon, authenticated;
grant all on courses.lesson_resources to service_role;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'course-resources',
  'course-resources',
  false,
  104857600,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip',
    'text/plain',
    'text/csv',
    'image/jpeg',
    'image/png',
    'image/webp',
    'audio/mpeg',
    'audio/wav'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
