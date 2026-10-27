-- ============================================================================
-- Support tickets: chat between students and support agents.
-- Messages are deleted when the ticket is closed.
-- ============================================================================

create schema if not exists support;

grant usage on schema support to service_role;

-- Ticket status enum
create type support.ticket_status as enum ('open', 'in_progress', 'closed');

-- Tickets
create table support.tickets (
  id          uuid primary key default gen_random_uuid(),
  subject     text not null,
  student_id  uuid not null references iam.profiles (id) on delete cascade,
  assigned_to uuid references iam.profiles (id) on delete set null,
  status      support.ticket_status not null default 'open',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  closed_at   timestamptz
);

-- Chat messages within a ticket
create table support.messages (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  uuid not null references support.tickets (id) on delete cascade,
  sender_id  uuid not null references iam.profiles (id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);

-- Index for fast lookups
create index idx_tickets_student on support.tickets (student_id);
create index idx_tickets_assigned on support.tickets (assigned_to);
create index idx_tickets_status on support.tickets (status);
create index idx_messages_ticket on support.messages (ticket_id);

-- Auto-delete messages when ticket is closed
create or replace function support.on_ticket_closed()
returns trigger
language plpgsql
security definer
set search_path = support
as $$
begin
  if new.status = 'closed' and old.status <> 'closed' then
    delete from support.messages where ticket_id = new.id;
    new.closed_at = now();
  end if;
  return new;
end;
$$;

create trigger trg_ticket_closed
before update on support.tickets
for each row execute function support.on_ticket_closed();

-- Permissions: only service_role (API) accesses this schema
grant all on all tables in schema support to service_role;
grant all on all sequences in schema support to service_role;
