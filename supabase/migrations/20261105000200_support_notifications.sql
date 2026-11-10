-- Student notifications are generated in the same transaction as the support action.
create table support.notifications (
 id uuid primary key default gen_random_uuid(),
 ticket_id uuid not null references support.tickets(id) on delete cascade,
 student_id uuid not null references iam.profiles(id) on delete cascade,
 title text not null,
 description text not null,
 created_at timestamptz not null default now()
);
create index support_notifications_student on support.notifications(student_id,created_at desc);
alter table support.notifications enable row level security;
revoke all on support.notifications from public,anon,authenticated;
grant all on support.notifications to service_role;

create function support.notify_student()
returns trigger language plpgsql security invoker set search_path='' as $$
declare t support.tickets;
begin
 if tg_table_name='messages' then
  select * into t from support.tickets where id=new.ticket_id;
  if new.sender_id=t.assigned_to and exists(select 1 from iam.profiles where id=new.sender_id and role::text='soporte') then
   insert into support.notifications(ticket_id,student_id,title,description)
    values(t.id,t.student_id,'Soporte respondió tu solicitud',t.subject || ': ' || left(new.body,200));
  end if;
 else
  if old.status is distinct from new.status then
   insert into support.notifications(ticket_id,student_id,title,description)
    values(new.id,new.student_id,
     case new.status::text when 'resolved' then 'Tu solicitud fue resuelta' when 'closed' then 'Tu solicitud fue cerrada' else 'Soporte está atendiendo tu solicitud' end,
     new.subject);
  end if;
 end if;
 return new;
end;
$$;
create trigger trg_support_reply_notification after insert on support.messages for each row execute function support.notify_student();
create trigger trg_support_status_notification after update of status on support.tickets for each row execute function support.notify_student();
revoke all on function support.notify_student() from public,anon,authenticated;
grant execute on function support.notify_student() to service_role;

alter function courses.notification_feed(uuid) rename to academic_notification_feed;
create function courses.notification_feed(p_user_id uuid)
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
 ) feed order by occurred_at desc,id limit 100;
$$;
revoke all on function courses.notification_feed(uuid) from public,anon,authenticated;
grant execute on function courses.notification_feed(uuid) to service_role;
notify pgrst,'reload schema';
