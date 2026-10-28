-- Additive migration: preserve existing classes and progress.
alter table video.live_sessions add column if not exists join_url text;
create table if not exists courses.student_resume (
 student_id uuid not null references auth.users(id) on delete cascade,
 course_id uuid not null references courses.courses(id) on delete cascade,
 lesson_id uuid not null references courses.lessons(id) on delete cascade,
 position_seconds double precision not null default 0 check (position_seconds >= 0),
 updated_at timestamptz not null default now(),
 primary key (student_id, course_id)
);
alter table courses.student_resume enable row level security;
revoke all on courses.student_resume from anon, authenticated;
grant all on courses.student_resume to service_role;

alter table courses.courses add column if not exists content_type text not null default 'course' check (content_type in ('course', 'masterclass', 'workshop'));
alter table video.videos add column if not exists live_session_id uuid references video.live_sessions(id) on delete set null;
