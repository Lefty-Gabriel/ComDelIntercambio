-- Resolution preserves history; legacy closed tickets retain their existing behavior.
alter type support.ticket_status add value if not exists 'resolved';
alter table support.tickets add column labels text[] not null default '{}';
alter table support.tickets add column resolved_at timestamptz;
alter table support.tickets add constraint tickets_labels_limit check (cardinality(labels) <= 5);

create or replace function support.organize_ticket(p_ticket_id uuid, p_actor_id uuid, p_resolve boolean, p_labels text[])
returns support.tickets language plpgsql security invoker set search_path = '' as $$
declare t support.tickets;
begin
  perform support.require_actor(p_actor_id, 'soporte');
  select * into t from support.tickets where id=p_ticket_id for update;
  if not found then raise exception 'Ticket not found' using errcode='P0002'; end if;
  if t.assigned_to is distinct from p_actor_id then raise exception 'Claim this ticket first' using errcode='42501'; end if;
  if p_resolve then
    if t.status::text='closed' then raise exception 'Ticket is closed'; end if;
    update support.tickets set status='resolved',resolved_at=coalesce(resolved_at,now()) where id=p_ticket_id returning * into t;
  else
    if p_labels is null or cardinality(p_labels)>5 or exists(select 1 from unnest(p_labels) label where label is null or length(btrim(label)) not between 1 and 32) then
      raise exception 'Use up to 5 labels of 1 to 32 characters';
    end if;
    update support.tickets set labels=p_labels where id=p_ticket_id returning * into t;
  end if;
  return t;
end;
$$;

create or replace function support.guard_message()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare t support.tickets;
begin
  select * into t from support.tickets where id=new.ticket_id for update;
  if not found or t.status::text in ('closed','resolved') then raise exception 'Ticket is resolved or closed'; end if;
  return new;
end;
$$;

-- Also protects claim/send races and prevents reopening a resolved case.
create or replace function support.guard_resolved_ticket()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.status::text='resolved' and new.status::text<>'resolved' then raise exception 'Resolved tickets cannot be reopened'; end if;
  return new;
end;
$$;
create trigger trg_guard_resolved_ticket before update on support.tickets for each row execute function support.guard_resolved_ticket();
revoke all on function support.organize_ticket(uuid,uuid,boolean,text[]) from public,anon,authenticated;
revoke all on function support.guard_resolved_ticket() from public,anon,authenticated;
grant execute on function support.organize_ticket(uuid,uuid,boolean,text[]) to service_role;
grant execute on function support.guard_resolved_ticket() to service_role;
notify pgrst, 'reload schema';
