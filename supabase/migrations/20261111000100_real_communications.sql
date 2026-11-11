-- Requires canonical iam.profiles roles (estudiante/mentor/admin/soporte),
-- profile full_name/avatar_url and iam.student_mentors(student_id,mentor_id).
-- Additive only: no seed data, existing row updates, or history rewrites.
create table courses.forum_threads (
 id uuid primary key default gen_random_uuid(),
 author_id uuid not null references iam.profiles(id) on delete cascade,
 title text not null check(length(btrim(title)) between 1 and 200),
 category text not null check(category in ('Ventas B2B','Finanzas','Casos de Éxito','Liderazgo')),
 content text not null check(length(btrim(content)) between 1 and 4000),
 created_at timestamptz not null default now()
);
create index forum_threads_created_idx on courses.forum_threads(created_at desc,id desc);
create table courses.forum_replies (
 id uuid primary key default gen_random_uuid(),
 thread_id uuid not null references courses.forum_threads(id) on delete cascade,
 author_id uuid not null references iam.profiles(id) on delete cascade,
 content text not null check(length(btrim(content)) between 1 and 2000),
 created_at timestamptz not null default now()
);
create index forum_replies_thread_idx on courses.forum_replies(thread_id,created_at desc,id desc);
create table courses.forum_likes (
 thread_id uuid not null references courses.forum_threads(id) on delete cascade,
 user_id uuid not null references iam.profiles(id) on delete cascade,
 primary key(thread_id,user_id)
);
create table courses.mentor_messages (
 id uuid primary key default gen_random_uuid(),
 student_id uuid not null references iam.profiles(id) on delete cascade,
 mentor_id uuid not null references iam.profiles(id) on delete cascade,
 sender_id uuid not null references iam.profiles(id) on delete cascade,
 body text not null check(length(btrim(body)) between 1 and 2000),
 created_at timestamptz not null default now(),
 check(student_id<>mentor_id),check(sender_id in (student_id,mentor_id))
);
create index mentor_messages_pair_idx on courses.mentor_messages(student_id,mentor_id,created_at desc,id desc);
alter table courses.forum_threads enable row level security;
alter table courses.forum_replies enable row level security;
alter table courses.forum_likes enable row level security;
alter table courses.mentor_messages enable row level security;
revoke all on courses.forum_threads,courses.forum_replies,courses.forum_likes,courses.mentor_messages from public,anon,authenticated;
grant all on courses.forum_threads,courses.forum_replies,courses.forum_likes,courses.mentor_messages to service_role;

create function courses.forum_thread_view(p_id uuid,p_actor_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',t.id,'author',p.full_name,'identityRole',p.role::text,
 'authorAvatar',p.avatar_url,'title',t.title,'content',t.content,'category',t.category,'createdAt',t.created_at,
 'likes',(select count(*) from courses.forum_likes l where l.thread_id=t.id),
 'likedByMe',exists(select 1 from courses.forum_likes l where l.thread_id=t.id and l.user_id=p_actor_id),
 'commentsCount',(select count(*) from courses.forum_replies r where r.thread_id=t.id),
 'comments',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'author',a.full_name,'identityRole',a.role::text,'content',r.content,'createdAt',r.created_at) order by r.created_at,r.id)
 from (select * from courses.forum_replies where thread_id=t.id order by created_at desc,id desc limit 200) r join iam.profiles a on a.id=r.author_id),'[]'::jsonb))
 from courses.forum_threads t join iam.profiles p on p.id=t.author_id where t.id=p_id;
$$;
create function courses.forum_action(p_actor_id uuid,p_action text,p_input jsonb default '{}'::jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare actor_role text; target uuid;
begin
 select role::text into actor_role from iam.profiles where id=p_actor_id for share;
 if actor_role is null or actor_role not in ('estudiante','mentor','admin') then raise exception 'Academic community access required' using errcode='42501'; end if;
 if p_action='list' then
   return coalesce((select jsonb_agg(courses.forum_thread_view(t.id,p_actor_id) order by t.created_at desc,t.id desc) from (select id,created_at from courses.forum_threads order by created_at desc,id desc limit 100) t),'[]'::jsonb);
 elsif p_action='create' then
   insert into courses.forum_threads(author_id,title,category,content) values(p_actor_id,btrim(p_input->>'title'),p_input->>'category',btrim(p_input->>'content')) returning id into target;
 elsif p_action in ('reply','like') then
   target:=(p_input->>'id')::uuid;
   if not exists(select 1 from courses.forum_threads where id=target) then raise exception 'Debate no encontrado' using errcode='P0002'; end if;
   if p_action='reply' then
     insert into courses.forum_replies(thread_id,author_id,content) values(target,p_actor_id,btrim(p_input->>'content'));
   else
     if jsonb_typeof(p_input->'liked') is distinct from 'boolean' then raise exception 'Explicit liked boolean required' using errcode='22023'; end if;
     if (p_input->>'liked')::boolean then
       insert into courses.forum_likes(thread_id,user_id) values(target,p_actor_id) on conflict do nothing;
     else delete from courses.forum_likes where thread_id=target and user_id=p_actor_id;
     end if;
   end if;
 else raise exception 'Unknown forum action' using errcode='22023';
 end if;
 return courses.forum_thread_view(target,p_actor_id);
end;
$$;

create function courses.mentor_chat_action(p_actor_id uuid,p_action text,p_student_id uuid default null,p_body text default null,p_expected_mentor_id uuid default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare actor_role text; current_mentor uuid; result jsonb; sent_id uuid;
begin
 select role::text into actor_role from iam.profiles where id=p_actor_id for share;
 if actor_role is null or actor_role not in ('estudiante','mentor') then raise exception 'Private chat requires student or mentor identity' using errcode='42501'; end if;
 if p_action='contacts' then
   return coalesce((select jsonb_agg(jsonb_build_object('studentId',s.student_id,'mentorId',s.mentor_id,'id',case when actor_role='estudiante' then m.id else a.id end,'name',case when actor_role='estudiante' then m.full_name else a.full_name end,'identityRole',case when actor_role='estudiante' then m.role::text else a.role::text end) order by s.student_id)
     from iam.student_mentors s join iam.profiles a on a.id=s.student_id and a.role::text='estudiante'
     join iam.profiles m on m.id=s.mentor_id and m.role::text='mentor'
     where (actor_role='estudiante' and s.student_id=p_actor_id) or (actor_role='mentor' and s.mentor_id=p_actor_id)),'[]'::jsonb);
 end if;
 -- Shared assignment lock serializes read/send with the existing assignment upsert.
 -- The current mentor identifies the history pair: reassignment never reveals old history.
 select mentor_id into current_mentor from iam.student_mentors where student_id=p_student_id for share;
 if current_mentor is null or current_mentor is distinct from p_expected_mentor_id or not ((actor_role='estudiante' and p_actor_id=p_student_id) or (actor_role='mentor' and p_actor_id=current_mentor)) then
   raise exception 'No tienes acceso a esta asignación de mentor' using errcode='42501';
 end if;
 perform id from iam.profiles where id in (p_student_id,current_mentor) order by id for share;
 if not exists(select 1 from iam.profiles where id=p_student_id and role::text='estudiante') or not exists(select 1 from iam.profiles where id=current_mentor and role::text='mentor') then
   raise exception 'La asignación ya no tiene participantes válidos' using errcode='42501';
 end if;
 if p_action='send' then
   insert into courses.mentor_messages(student_id,mentor_id,sender_id,body) values(p_student_id,current_mentor,p_actor_id,btrim(p_body)) returning id into sent_id;
 elsif p_action<>'messages' then raise exception 'Unknown chat action' using errcode='22023'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'sender_id',m.sender_id,'sender_name',p.full_name,'sender_role',p.role::text,'body',m.body,'created_at',m.created_at) order by m.created_at,m.id),'[]'::jsonb) into result
 from (select * from courses.mentor_messages where student_id=p_student_id and mentor_id=current_mentor and (sent_id is null or id=sent_id) order by created_at desc,id desc limit 200) m join iam.profiles p on p.id=m.sender_id;
 if sent_id is not null then return result->0; end if;
 return result;
end;
$$;
revoke all on function courses.forum_thread_view(uuid,uuid),courses.forum_action(uuid,text,jsonb),courses.mentor_chat_action(uuid,text,uuid,text,uuid) from public,anon,authenticated;
grant execute on function courses.forum_thread_view(uuid,uuid),courses.forum_action(uuid,text,jsonb),courses.mentor_chat_action(uuid,text,uuid,text,uuid) to service_role;
