-- One personal mentor per student; mentors may have many students.
create table iam.student_mentors (
  student_id uuid primary key references iam.profiles(id) on delete cascade,
  mentor_id uuid not null references iam.profiles(id) on delete cascade,
  assigned_by uuid references iam.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (student_id <> mentor_id)
);
create index student_mentors_mentor_idx on iam.student_mentors(mentor_id);
alter table iam.student_mentors enable row level security;
grant all on iam.student_mentors to service_role;
