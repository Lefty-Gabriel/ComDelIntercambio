begin;
do $$
declare student uuid; course uuid; ids uuid[]:=array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()]; i integer; stage text; read_id text;
begin
 select e.student_id,e.course_id into student,course from courses.active_enrollments e join iam.profiles p on p.id=e.student_id and p.role::text='estudiante' where e.can_join_live limit 1;
 if student is null then raise exception 'No active student enrollment available for verification'; end if;
 insert into video.live_sessions(id,course_id,title,status,scheduled_at,duration_minutes,created_at) values
 (ids[1],course,'Reminder verification 24h','scheduled',now()+interval '2 hours',60,now()-interval '30 days'),
 (ids[2],course,'Reminder verification 1h','scheduled',now()+interval '30 minutes',60,now()-interval '30 days'),
 (ids[3],course,'Reminder verification 10m','scheduled',now()+interval '5 minutes',60,now()-interval '30 days'),
 (ids[4],course,'Reminder verification live','scheduled',now()-interval '5 minutes',60,now()-interval '30 days');
 for i in 1..4 loop
  stage:=(array['24h','1h','10m','live'])[i];
  if not exists(select 1 from courses.notification_feed(student) f where f.id like 'live-reminder:'||ids[i]::text||':%:'||stage and f.description like '%hora de Ecuador%') then raise exception 'Missing reminder stage %',stage; end if;
  if (select count(*) from courses.notification_feed(student) f where f.id like 'live-reminder:'||ids[i]::text||':%')<>1 then raise exception 'Duplicate reminder'; end if;
 end loop;
 if exists(select 1 from courses.notification_feed(gen_random_uuid()) f where f.id like 'live-reminder:%') then raise exception 'Reminder leaked to unauthorized recipient'; end if;
 select f.id into read_id from courses.notification_feed(student) f where f.id like 'live-reminder:'||ids[3]::text||':%';
 insert into courses.notification_reads(user_id,notification_id,read_at) values(student,read_id,now());
 if not exists(select 1 from courses.notification_feed(student) f where f.id=read_id and f.is_read) then raise exception 'Read state not preserved'; end if;
 update video.live_sessions set scheduled_at=scheduled_at+interval '1 minute' where id=ids[3];
 if not exists(select 1 from courses.notification_feed(student) f where f.id like 'live-reminder:'||ids[3]::text||':%' and f.id<>read_id and not f.is_read) then raise exception 'Rescheduled reminder not refreshed'; end if;
 update video.live_sessions set status='ended' where id=any(ids);
 if exists(select 1 from courses.notification_feed(student) f where f.id like 'live-reminder:%' and split_part(f.id,':',2)::uuid=any(ids)) then raise exception 'Ended class still has active reminder'; end if;
 raise notice 'Reminder stages, deduplication, permissions, read state, rescheduling and ended-state checks passed';
end $$;
rollback;
