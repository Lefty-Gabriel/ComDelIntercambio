-- ============================================================================
-- Traction - clases en vivo (LiveKit)
-- Una sesion = una sala de LiveKit. La sala es efimera; aca guardamos metadata.
-- ============================================================================

create table video.live_sessions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses.courses (id) on delete cascade,
  title text not null,
  room_name text not null unique,
  status text not null default 'scheduled',
  started_by uuid references iam.profiles (id) on delete set null,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  constraint video_live_sessions_status_check
    check (status in ('scheduled', 'live', 'ended'))
);

create index video_live_sessions_course_id_idx on video.live_sessions (course_id);

grant all on all tables in schema video to service_role;
grant select on all tables in schema video to authenticated;
