create or replace function courses.notification_feed(p_user_id uuid)
returns table(id text,type text,course_id uuid,title text,description text,occurred_at timestamptz,is_read boolean)
language sql stable set search_path='' as $$
 select * from (
 select * from courses.pre_communication_notification_feed(p_user_id)
 union all
 select 'forum:'||t.id::text||':'||r.id::text,'forum',null::uuid,
 p.full_name||U&' respondi\00F3 en Comunidad',t.title||': '||left(r.content,200),r.created_at,rd.notification_id is not null
 from courses.forum_replies r join courses.forum_threads t on t.id=r.thread_id
 join iam.profiles p on p.id=r.author_id
 join iam.profiles recipient on recipient.id=p_user_id and recipient.role::text in ('estudiante','mentor','admin')
 left join courses.notification_reads rd on rd.user_id=p_user_id and rd.notification_id='forum:'||t.id::text||':'||r.id::text
 where r.author_id<>p_user_id and (recipient.role::text in ('admin','mentor') or t.author_id=p_user_id or exists (
 select 1 from courses.forum_replies previous where previous.thread_id=t.id and previous.author_id=p_user_id and previous.created_at<r.created_at))
 union all
 select 'forum:'||t.id::text||':created','forum',null::uuid,
 p.full_name||U&' public\00F3 un debate',t.title,t.created_at,rd.notification_id is not null
 from courses.forum_threads t join iam.profiles p on p.id=t.author_id
 join iam.profiles recipient on recipient.id=p_user_id and recipient.role::text in ('admin','mentor')
 left join courses.notification_reads rd on rd.user_id=p_user_id and rd.notification_id='forum:'||t.id::text||':created'
 where t.author_id<>p_user_id
 union all
 select 'chat:'||m.student_id::text||':'||m.mentor_id::text||':'||m.id::text,'chat',null::uuid,
 p.full_name||U&' te envi\00F3 un mensaje','Tienes un nuevo mensaje privado',m.created_at,rd.notification_id is not null
 from courses.mentor_messages m
 join iam.student_mentors a on a.student_id=m.student_id and a.mentor_id=m.mentor_id
 join iam.profiles s on s.id=m.student_id and s.role::text='estudiante'
 join iam.profiles mentor on mentor.id=m.mentor_id and mentor.role::text='mentor'
 join iam.profiles p on p.id=m.sender_id
 left join courses.notification_reads rd on rd.user_id=p_user_id and rd.notification_id='chat:'||m.student_id::text||':'||m.mentor_id::text||':'||m.id::text
 where p_user_id in (m.student_id,m.mentor_id) and m.sender_id<>p_user_id
 ) feed order by occurred_at desc,id limit 100;
$$;
revoke all on function courses.notification_feed(uuid) from public,anon,authenticated;
grant execute on function courses.notification_feed(uuid) to service_role;
notify pgrst,'reload schema';
