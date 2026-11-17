-- Preserve the existing academic, support and community feed.
alter function courses.notification_feed(uuid) rename to pre_live_reminder_notification_feed;
create or replace function courses.notification_feed(p_user_id uuid)
returns table(id text,type text,course_id uuid,title text,description text,occurred_at timestamptz,is_read boolean)
language sql stable set search_path='' as $$
 with me as (
  select p.id,p.role::text as role from iam.profiles p where p.id=p_user_id and p.role::text in ('admin','mentor','estudiante')
 ), eligible as (
  select s.*,c.title as course_title
  from video.live_sessions s join courses.courses c on c.id=s.course_id cross join me
  where s.status::text<>'ended'
   and s.scheduled_at>now()-make_interval(mins=>s.duration_minutes)
   and s.scheduled_at<=now()+interval '24 hours'
   and (me.role='admin' or (me.role='mentor' and c.docente_id=me.id) or
    (me.role='estudiante' and exists(select 1 from courses.active_enrollments e where e.student_id=me.id and e.course_id=c.id and e.can_join_live)))
 ), stages as (
  select e.*,case when now()>=e.scheduled_at then 'live' when e.scheduled_at-now()<=interval '10 minutes' then '10m' when e.scheduled_at-now()<=interval '1 hour' then '1h' else '24h' end as stage from eligible e
 ), reminders as (
  select 'live-reminder:'||s.id::text||':'||(extract(epoch from s.scheduled_at)::bigint)::text||':'||s.stage as id,
   'live'::text as type,s.course_id,
   (case s.stage when 'live' then 'Tu clase comienza ahora: ' when '10m' then 'Tu clase comienza en menos de 10 minutos: ' when '1h' then 'Tu clase comienza en menos de 1 hora: ' else 'Recuerda tu próxima clase: ' end)||s.title as title,
   s.course_title||' · '||to_char(s.scheduled_at at time zone 'America/Guayaquil','DD/MM/YYYY')||' a las '||to_char(s.scheduled_at at time zone 'America/Guayaquil','HH24:MI')||' (hora de Ecuador)' as description,
   s.scheduled_at-(case s.stage when 'live' then interval '0 seconds' when '10m' then interval '10 minutes' when '1h' then interval '1 hour' else interval '24 hours' end) as occurred_at
  from stages s
 ), old_feed as (
  select f.id,f.type,f.course_id,f.title,
   case when s.id is not null then f.description||' · '||to_char(s.scheduled_at at time zone 'America/Guayaquil','DD/MM/YYYY')||' a las '||to_char(s.scheduled_at at time zone 'America/Guayaquil','HH24:MI')||' (hora de Ecuador)' else f.description end as description,
   f.occurred_at,f.is_read
  from courses.pre_live_reminder_notification_feed(p_user_id) f
  left join video.live_sessions s on f.id='live:'||s.id::text
 )
 select * from (
  select * from old_feed
  union all
  select r.id,r.type,r.course_id,r.title,r.description,r.occurred_at,n.notification_id is not null
  from reminders r left join courses.notification_reads n on n.user_id=p_user_id and n.notification_id=r.id
 ) feed order by occurred_at desc,id limit 100;
$$;
revoke all on function courses.pre_live_reminder_notification_feed(uuid) from public,anon,authenticated;
revoke all on function courses.notification_feed(uuid) from public,anon,authenticated;
grant execute on function courses.pre_live_reminder_notification_feed(uuid) to service_role;
grant execute on function courses.notification_feed(uuid) to service_role;
notify pgrst,'reload schema';
