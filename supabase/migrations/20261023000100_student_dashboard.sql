-- Student dashboard: course content, persisted progress and announcements.

create table courses.course_modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses.courses (id) on delete cascade,
  title text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, position)
);

create table courses.lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references courses.course_modules (id) on delete cascade,
  video_id uuid references video.videos (id) on delete set null,
  title text not null,
  summary text not null default '',
  duration_minutes integer not null default 0,
  position integer not null default 0,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lessons_duration_non_negative check (duration_minutes >= 0),
  unique (module_id, position),
  unique (video_id)
);

create table courses.lesson_progress (
  student_id uuid not null references iam.profiles (id) on delete cascade,
  lesson_id uuid not null references courses.lessons (id) on delete cascade,
  completed boolean not null default false,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (student_id, lesson_id)
);

create table courses.announcements (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses.courses (id) on delete cascade,
  title text not null,
  body text not null,
  audience text not null default 'student',
  is_published boolean not null default false,
  published_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by uuid references iam.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint announcements_audience_check
    check (audience in ('all', 'student')),
  constraint announcements_expiry_check
    check (expires_at is null or expires_at > published_at)
);

create index course_modules_course_position_idx
  on courses.course_modules (course_id, position);
create index lessons_module_position_idx
  on courses.lessons (module_id, position);
create index lesson_progress_student_updated_idx
  on courses.lesson_progress (student_id, updated_at desc);
create index announcements_published_idx
  on courses.announcements (is_published, published_at desc);
create index announcements_course_idx
  on courses.announcements (course_id);

alter table courses.course_modules enable row level security;
alter table courses.lessons enable row level security;
alter table courses.lesson_progress enable row level security;
alter table courses.announcements enable row level security;

revoke all on courses.course_modules from public, anon, authenticated;
revoke all on courses.lessons from public, anon, authenticated;
revoke all on courses.lesson_progress from public, anon, authenticated;
revoke all on courses.announcements from public, anon, authenticated;

grant all on courses.course_modules to service_role;
grant all on courses.lessons to service_role;
grant all on courses.lesson_progress to service_role;
grant all on courses.announcements to service_role;
