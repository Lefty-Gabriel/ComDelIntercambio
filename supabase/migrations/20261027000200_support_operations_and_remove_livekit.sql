-- Service-only support operations serialize all writes on the ticket row.
alter table support.tickets enable row level security;
alter table support.messages enable row level security;
revoke all on schema support from public, anon, authenticated;
revoke all on all tables in schema support from public, anon, authenticated;
revoke all on all functions in schema support from public, anon, authenticated;

create or replace function support.require_actor(p_actor_id uuid, p_role text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from iam.profiles where id = p_actor_id and role::text = p_role) then
    raise exception 'Role not permitted' using errcode = '42501';
  end if;
end;
$$;

create or replace function support.create_ticket(p_actor_id uuid, p_subject text, p_body text)
returns support.tickets language plpgsql security invoker set search_path = '' as $$
declare t support.tickets;
begin
  perform support.require_actor(p_actor_id, 'estudiante');
  if length(btrim(p_subject)) not between 1 and 200 or length(btrim(p_body)) not between 1 and 2000 then
    raise exception 'Subject and message are required within their length limits';
  end if;
  insert into support.tickets(subject, student_id) values (btrim(p_subject),p_actor_id) returning * into t;
  insert into support.messages(ticket_id,sender_id,body) values (t.id,p_actor_id,btrim(p_body));
  return t;
end;
$$;

create or replace function support.claim_ticket(p_ticket_id uuid, p_actor_id uuid)
returns support.tickets language plpgsql security invoker set search_path = '' as $$
declare t support.tickets;
begin
  perform support.require_actor(p_actor_id, 'soporte');
  select * into t from support.tickets where id=p_ticket_id for update;
  if not found then raise exception 'Ticket not found' using errcode='P0002'; end if;
  if t.status='closed' then raise exception 'Ticket is closed'; end if;
  if t.assigned_to is not null and t.assigned_to <> p_actor_id then
    raise exception 'Ticket is assigned to another agent' using errcode='42501';
  end if;
  update support.tickets set assigned_to=p_actor_id,status='in_progress',updated_at=now() where id=p_ticket_id returning * into t;
  return t;
end;
$$;

create or replace function support.send_message(p_ticket_id uuid, p_actor_id uuid, p_body text)
returns support.messages language plpgsql security invoker set search_path = '' as $$
declare t support.tickets; m support.messages;
begin
  select * into t from support.tickets where id=p_ticket_id for update;
  if not found then raise exception 'Ticket not found' using errcode='P0002'; end if;
  if t.status='closed' then raise exception 'Ticket is closed'; end if;
  if t.student_id=p_actor_id then perform support.require_actor(p_actor_id,'estudiante');
  elsif t.assigned_to=p_actor_id then perform support.require_actor(p_actor_id,'soporte');
  else raise exception 'Ticket access denied' using errcode='42501'; end if;
  if length(btrim(p_body)) not between 1 and 2000 then raise exception 'Message is required within its length limit'; end if;
  insert into support.messages(ticket_id,sender_id,body) values(p_ticket_id,p_actor_id,btrim(p_body)) returning * into m;
  update support.tickets set updated_at=now() where id=p_ticket_id;
  return m;
end;
$$;

create or replace function support.close_ticket(p_ticket_id uuid, p_actor_id uuid)
returns support.tickets language plpgsql security invoker set search_path = '' as $$
declare t support.tickets;
begin
  perform support.require_actor(p_actor_id,'soporte');
  select * into t from support.tickets where id=p_ticket_id for update;
  if not found then raise exception 'Ticket not found' using errcode='P0002'; end if;
  if t.assigned_to is distinct from p_actor_id then raise exception 'Ticket is assigned to another agent' using errcode='42501'; end if;
  update support.tickets set status='closed',updated_at=now() where id=p_ticket_id returning * into t;
  return t;
end;
$$;

-- Defense in depth for direct service-role inserts as well as RPC calls.
create or replace function support.guard_message()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare t support.tickets;
begin
  select * into t from support.tickets where id=new.ticket_id for update;
  if not found or t.status='closed' then raise exception 'Ticket is closed or missing'; end if;
  return new;
end;
$$;
create trigger trg_guard_message before insert or update on support.messages
for each row execute function support.guard_message();

create or replace function support.on_ticket_closed()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.status='closed' and new.status <> 'closed' then raise exception 'Closed tickets cannot be reopened'; end if;
  if new.status='closed' then
    delete from support.messages where ticket_id=new.id;
    new.closed_at=coalesce(old.closed_at,now());
  end if;
  new.updated_at=now();
  return new;
end;
$$;
-- Remove any legacy messages already attached to closed tickets.
delete from support.messages where ticket_id in (select id from support.tickets where status='closed');
revoke all on all functions in schema support from public, anon, authenticated;
grant usage on schema support to service_role;
grant all on all tables in schema support to service_role;
grant execute on all functions in schema support to service_role;

-- Historical scheduling data remains; conferencing is deferred.
alter table video.live_sessions drop column room_name;
notify pgrst, 'reload schema';
