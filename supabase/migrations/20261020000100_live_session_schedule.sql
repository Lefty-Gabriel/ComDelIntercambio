-- Programación real de las clases en vivo.
alter table video.live_sessions
  add column if not exists scheduled_at timestamptz,
  add column if not exists duration_minutes integer not null default 60;

update video.live_sessions
set scheduled_at = created_at
where scheduled_at is null;

alter table video.live_sessions
  alter column scheduled_at set not null;

alter table video.live_sessions
  add constraint live_sessions_duration_positive
  check (duration_minutes between 15 and 480);

create index if not exists live_sessions_scheduled_at_idx
  on video.live_sessions (scheduled_at);
