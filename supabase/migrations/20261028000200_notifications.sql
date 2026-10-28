-- Notifications are queried from real academic publications. No email is sent.
alter table courses.announcements add column if not exists kind text not null default 'announcement' check (kind in ('announcement', 'event'));
create table courses.notification_reads (
 user_id uuid not null references iam.profiles(id) on delete cascade,
 notification_id text not null,
 read_at timestamptz not null default now(),
 primary key (user_id, notification_id)
);
alter table courses.notification_reads enable row level security;
revoke all on courses.notification_reads from anon, authenticated;
grant all on courses.notification_reads to service_role;

create or replace function courses.notification_feed(p_user_id uuid)
returns table (id text, type text, course_id uuid, title text, description text, occurred_at timestamptz, is_read boolean)
language sql stable set search_path = '' as $$
 with me as (
  select p.id, p.role from iam.profiles p where p.id = p_user_id and p.role in ('admin','mentor','estudiante')
 ), accessible as (
  select c.id from courses.courses c cross join me
  where me.role = 'admin' or (me.role = 'mentor' and c.docente_id = me.id)
    or (me.role = 'estudiante' and exists (select 1 from courses.enrollments e where e.course_id = c.id and e.student_id = me.id and e.status = 'active'))
 ), feed as (
  select 'live:' || s.id::text as id, 'live'::text as type, s.course_id, s.title, 'Nueva clase: ' || c.title as description, s.created_at as occurred_at
   from video.live_sessions s join courses.courses c on c.id = s.course_id join accessible a on a.id = s.course_id
  union all
  select 'video:' || v.id::text, 'replay', v.course_id, v.title, 'Grabacion disponible: ' || c.title, v.updated_at
   from video.videos v join courses.courses c on c.id = v.course_id join accessible a on a.id = v.course_id where v.status = 'ready'
  union all
  select 'lesson:' || l.id::text, 'content', m.course_id, l.title, 'Leccion publicada: ' || c.title, l.updated_at
   from courses.lessons l join courses.course_modules m on m.id = l.module_id join courses.courses c on c.id = m.course_id join accessible a on a.id = m.course_id where l.is_published
  union all
  select 'resource:' || r.id::text, 'resource', m.course_id, r.title, 'Nuevo material: ' || c.title, r.created_at
   from courses.lesson_resources r join courses.lessons l on l.id = r.lesson_id join courses.course_modules m on m.id = l.module_id join courses.courses c on c.id = m.course_id join accessible a on a.id = m.course_id where r.is_published and l.is_published
  union all
  select 'announcement:' || n.id::text, n.kind, n.course_id, n.title, n.body, n.published_at
   from courses.announcements n cross join me
   where n.is_published and n.published_at <= now() and (n.expires_at is null or n.expires_at > now())
    and (n.course_id is null or n.course_id in (select a.id from accessible a))
    and (n.audience = 'all' or me.role = 'estudiante' or me.role = 'admin')
 )
 select f.id, f.type, f.course_id, f.title, f.description, f.occurred_at, (r.notification_id is not null)
 from feed f left join courses.notification_reads r on r.user_id = p_user_id and r.notification_id = f.id
 order by f.occurred_at desc, f.id limit 100;
$$;
revoke all on function courses.notification_feed(uuid) from public, anon, authenticated;
grant execute on function courses.notification_feed(uuid) to service_role;
