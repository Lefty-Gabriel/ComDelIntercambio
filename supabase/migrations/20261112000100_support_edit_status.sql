-- Explicit status editing by support, with ownership checked under a row lock.
create or replace function support.set_ticket_status(p_ticket_id uuid, p_actor_id uuid, p_status text)
returns support.tickets language plpgsql security invoker set search_path = '' as $$
declare t support.tickets;
begin
  perform support.require_actor(p_actor_id, 'soporte');
  if p_status not in ('open','in_progress','resolved','closed') or p_status is null then raise exception 'Invalid status'; end if;
  select * into t from support.tickets where id=p_ticket_id for update;
  if not found then raise exception 'Ticket not found' using errcode='P0002'; end if;
  if t.assigned_to is not null and t.assigned_to <> p_actor_id then raise exception 'Ticket belongs to another agent' using errcode='42501'; end if;
  perform set_config('support.status_editor', p_actor_id::text, true);
  update support.tickets set status=p_status::support.ticket_status, assigned_to=p_actor_id,
    resolved_at=case when p_status='resolved' then coalesce(resolved_at,now()) else null end,
    closed_at=case when p_status='closed' then coalesce(closed_at,now()) else null end,
    updated_at=now() where id=p_ticket_id returning * into t;
  perform set_config('support.status_editor', '', true);
  return t;
end;
$$;
create or replace function support.guard_resolved_ticket()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.status::text='resolved' and new.status::text<>'resolved' and coalesce(current_setting('support.status_editor',true),'') <> new.assigned_to::text then raise exception 'Use the support status editor to reopen'; end if;
  return new;
end;
$$;
create or replace function support.on_ticket_closed()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.status::text='closed' and new.status::text<>'closed' and coalesce(current_setting('support.status_editor',true),'') <> new.assigned_to::text then raise exception 'Use the support status editor to reopen'; end if;
  if new.status::text='closed' then new.closed_at=coalesce(new.closed_at,now()); end if;
  new.updated_at=now();
  return new;
end;
$$;
revoke all on function support.set_ticket_status(uuid,uuid,text) from public,anon,authenticated;
grant execute on function support.set_ticket_status(uuid,uuid,text) to service_role;
notify pgrst, 'reload schema';
