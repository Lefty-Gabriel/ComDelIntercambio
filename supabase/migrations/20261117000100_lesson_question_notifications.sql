alter function courses.notification_feed(uuid) rename to pre_lesson_question_notification_feed;
create function courses.notification_feed(p_user_id uuid)
returns table(id text,type text,course_id uuid,title text,description text,occurred_at timestamptz,is_read boolean)
language sql stable set search_path='' as $$
 select * from (
  select * from courses.pre_lesson_question_notification_feed(p_user_id)
  union all
  select 'lesson-question:'||q.id::text||':'||l.id::text,'question',c.id,
    'Nueva pregunta de '||coalesce(nullif(p.full_name,''),'un estudiante'),
    c.title||' · '||l.title||': '||left(q.question,160),q.created_at,r.notification_id is not null
  from courses.lesson_questions q
  join courses.lessons l on l.id=q.lesson_id
  join courses.course_modules m on m.id=l.module_id
  join courses.courses c on c.id=m.course_id
  join iam.profiles mentor on mentor.id=p_user_id and mentor.role::text='mentor' and c.docente_id=mentor.id
  join iam.profiles p on p.id=q.student_id
  left join courses.notification_reads r on r.user_id=p_user_id and r.notification_id='lesson-question:'||q.id::text||':'||l.id::text
  where exists(select 1 from courses.active_enrollments e where e.student_id=q.student_id and e.course_id=c.id and e.can_view_content)
  union all
  select 'lesson-answer:'||q.id::text||':'||l.id::text,'answer',c.id,
    'Tu mentor respondió tu pregunta',c.title||' · '||l.title||': '||left(q.mentor_reply,160),coalesce(q.answered_at,q.updated_at),r.notification_id is not null
  from courses.lesson_questions q
  join courses.lessons l on l.id=q.lesson_id
  join courses.course_modules m on m.id=l.module_id
  join courses.courses c on c.id=m.course_id
  join iam.profiles p on p.id=p_user_id and p.role::text='estudiante' and q.student_id=p.id
  left join courses.notification_reads r on r.user_id=p_user_id and r.notification_id='lesson-answer:'||q.id::text||':'||l.id::text
  where q.status::text='answered' and q.mentor_reply is not null
    and exists(select 1 from courses.active_enrollments e where e.student_id=p_user_id and e.course_id=c.id and e.can_view_content)
 ) feed order by occurred_at desc,id limit 100;
$$;
revoke all on function courses.notification_feed(uuid) from public,anon,authenticated;
grant execute on function courses.notification_feed(uuid) to service_role;
notify pgrst,'reload schema';
