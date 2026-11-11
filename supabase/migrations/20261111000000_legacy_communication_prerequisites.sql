-- Minimal non-destructive alignment for an existing legacy local database.
-- Commit this migration before applying real_communications (new enum labels).
do $$
begin
 if exists(select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid join pg_namespace n on n.oid=t.typnamespace where n.nspname='iam' and t.typname='user_role' and e.enumlabel='alumno') then
  alter type iam.user_role rename value 'alumno' to 'estudiante';
 end if;
 if exists(select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid join pg_namespace n on n.oid=t.typnamespace where n.nspname='iam' and t.typname='user_role' and e.enumlabel='docente') then
  alter type iam.user_role rename value 'docente' to 'mentor';
 end if;
end $$;
alter type iam.user_role add value if not exists 'soporte';
alter table iam.profiles
 add column if not exists title text not null default '',
 add column if not exists company text not null default '',
 add column if not exists phone text not null default '',
 add column if not exists location text not null default '',
 add column if not exists linkedin text not null default '',
 add column if not exists website text not null default '',
 add column if not exists bio text not null default '',
 add column if not exists avatar_url text not null default '';
create table if not exists iam.student_mentors (
 student_id uuid primary key references iam.profiles(id) on delete cascade,
 mentor_id uuid not null references iam.profiles(id) on delete cascade,
 assigned_by uuid references iam.profiles(id) on delete set null,
 updated_at timestamptz not null default now(),check(student_id<>mentor_id)
);
create index if not exists student_mentors_mentor_idx on iam.student_mentors(mentor_id);
alter table iam.student_mentors enable row level security;
revoke all on iam.student_mentors from public,anon,authenticated;
grant usage on schema iam,courses to service_role;
grant select,update on iam.profiles to service_role;
grant all on iam.student_mentors to service_role;

-- Match the existing API-only domain boundary; Auth schema is untouched.
revoke all on schema iam,courses,video from public,anon,authenticated;
revoke all on all tables in schema iam,courses,video from public,anon,authenticated;
revoke all on all sequences in schema iam,courses,video from public,anon,authenticated;
revoke all on all functions in schema iam,courses,video from public,anon,authenticated;
grant usage on schema iam,courses,video to service_role;
grant all on all tables in schema iam,courses,video to service_role;
grant all on all sequences in schema iam,courses,video to service_role;
grant execute on all functions in schema iam,courses,video to service_role;
