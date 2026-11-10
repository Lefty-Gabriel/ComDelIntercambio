create table support.agent_notifications (
 id uuid primary key default gen_random_uuid(),
 ticket_id uuid not null references support.tickets(id) on delete cascade,
 agent_id uuid references iam.profiles(id) on delete cascade,
 title text not null, description text not null,
 created_at timestamptz not null default now()
);
alter table support.agent_notifications enable row level security;
revoke all on support.agent_notifications from public,anon,authenticated;
grant all on support.agent_notifications to service_role;
create index agent_notifications_ticket on support.agent_notifications(ticket_id);
create function support.notify_agent()
returns trigger language plpgsql security invoker set search_path='' as $$
declare t support.tickets;
begin
 select * into t from support.tickets where id=new.ticket_id;
 if new.sender_id=t.student_id then
  insert into support.agent_notifications(ticket_id,agent_id,title,description)
   values(t.id,t.assigned_to,case when t.assigned_to is null then 'Nueva solicitud de soporte' else 'El estudiante respondió tu ticket' end,t.subject || ': ' || left(new.body,200));
 end if;
 return new;
end;
$$;
create trigger trg_support_agent_notification after insert on support.messages for each row execute function support.notify_agent();
revoke all on function support.notify_agent() from public,anon,authenticated;
grant execute on function support.notify_agent() to service_role;

create or replace function courses.notification_feed(p_user_id uuid)
returns table(id text,type text,course_id uuid,title text,description text,occurred_at timestamptz,is_read boolean)
language sql stable set search_path='' as $$
 select * from (
  select * from courses.academic_notification_feed(p_user_id)
  union all
  select 'support:' || n.ticket_id::text || ':' || n.id::text,'support',null::uuid,n.title,n.description,n.created_at,(r.notification_id is not null)
   from support.notifications n
   join iam.profiles p on p.id=p_user_id and p.role::text='estudiante'
   left join courses.notification_reads r on r.user_id=p_user_id and r.notification_id='support:' || n.ticket_id::text || ':' || n.id::text
   where n.student_id=p_user_id
  union all
  select 'support:' || n.ticket_id::text || ':' || n.id::text,'support',null::uuid,n.title,n.description,n.created_at,(r.notification_id is not null)
   from support.agent_notifications n
   join support.tickets t on t.id=n.ticket_id
   join iam.profiles p on p.id=p_user_id and p.role::text='soporte'
   left join courses.notification_reads r on r.user_id=p_user_id and r.notification_id='support:' || n.ticket_id::text || ':' || n.id::text
   where (n.agent_id is null or n.agent_id=p_user_id) and (t.assigned_to=p_user_id or (t.assigned_to is null and t.status::text='open'))
 ) feed order by occurred_at desc,id limit 100;
$$;
notify pgrst,'reload schema';
