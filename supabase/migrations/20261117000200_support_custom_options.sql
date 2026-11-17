create table support.ticket_options (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references iam.profiles(id) on delete cascade,
 kind text not null check(kind in ('label','status')),
 name text not null check(length(btrim(name)) between 2 and 32),
 created_at timestamptz not null default now(),
 unique(owner_id,kind,name)
);
alter table support.ticket_options enable row level security;
revoke all on support.ticket_options from public,anon,authenticated;
grant all on support.ticket_options to service_role;
alter table support.tickets add column custom_status_id uuid references support.ticket_options(id) on delete set null;
alter table support.tickets add column custom_status text;

create function support.set_custom_ticket_status(p_ticket_id uuid,p_actor_id uuid,p_option_id uuid)
returns support.tickets language plpgsql security invoker set search_path='' as $$
declare t support.tickets; option_name text;
begin
 perform support.require_actor(p_actor_id,'soporte');
 select name into option_name from support.ticket_options where id=p_option_id and owner_id=p_actor_id and kind='status';
 if not found then raise exception 'Selecciona uno de tus estados personalizados' using errcode='42501'; end if;
 select * into t from support.tickets where id=p_ticket_id for update;
 if not found then raise exception 'Ticket not found' using errcode='P0002'; end if;
 if t.assigned_to is not null and t.assigned_to<>p_actor_id then raise exception 'Ticket assigned to another agent' using errcode='42501'; end if;
 if t.status::text in ('resolved','closed') then raise exception 'Reabre el ticket antes de asignar un estado personalizado'; end if;
 update support.tickets set assigned_to=p_actor_id,status='in_progress',custom_status_id=p_option_id,custom_status=option_name where id=p_ticket_id returning * into t;
 return t;
end;
$$;

-- A standard state explicitly replaces the custom state, even if both are in progress.
alter function support.set_ticket_status(uuid,uuid,text) rename to set_standard_ticket_status;
create function support.set_ticket_status(p_ticket_id uuid,p_actor_id uuid,p_status text)
returns support.tickets language plpgsql security invoker set search_path='' as $$
declare t support.tickets;
begin
 perform support.require_actor(p_actor_id,'soporte');
 select * into t from support.set_standard_ticket_status(p_ticket_id,p_actor_id,p_status);
 update support.tickets set custom_status_id=null,custom_status=null where id=p_ticket_id returning * into t;
 return t;
end;
$$;
create function support.clear_finished_custom_status()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status::text<>'in_progress' then new.custom_status_id=null; new.custom_status=null; end if;
 return new;
end;
$$;
create trigger trg_clear_finished_custom_status before update of status on support.tickets for each row execute function support.clear_finished_custom_status();
create function support.notify_custom_ticket_status()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.custom_status is not null and old.custom_status is distinct from new.custom_status then
  insert into support.notifications(ticket_id,student_id,title,description) values(new.id,new.student_id,'Tu solicitud tiene un nuevo estado',new.subject||' · '||new.custom_status);
 end if;
 return new;
end;
$$;
create trigger trg_notify_custom_ticket_status after update of custom_status on support.tickets for each row execute function support.notify_custom_ticket_status();
revoke all on function support.set_custom_ticket_status(uuid,uuid,uuid),support.set_ticket_status(uuid,uuid,text),support.clear_finished_custom_status(),support.notify_custom_ticket_status() from public,anon,authenticated;
grant execute on function support.set_custom_ticket_status(uuid,uuid,uuid),support.set_ticket_status(uuid,uuid,text),support.clear_finished_custom_status(),support.notify_custom_ticket_status() to service_role;
notify pgrst,'reload schema';
