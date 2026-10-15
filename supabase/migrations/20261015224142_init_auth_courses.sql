-- ============================================================================
-- Traction - inicial: identidad (iam) + cursos (courses)
-- Un schema por modulo.
-- ============================================================================

create schema if not exists iam;
create schema if not exists courses;

grant usage on schema iam to anon, authenticated, service_role;
grant usage on schema courses to anon, authenticated, service_role;

-- Rol de usuario del dominio
create type iam.user_role as enum ('alumno', 'docente', 'admin');

-- Perfiles: 1:1 con auth.users
create table iam.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  role iam.user_role not null default 'alumno',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Cursos
create table courses.courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  created_by uuid references iam.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Matriculas: el admin habilita el acceso de un alumno a un curso
create table courses.enrollments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses.courses (id) on delete cascade,
  student_id uuid not null references iam.profiles (id) on delete cascade,
  granted_by uuid references iam.profiles (id) on delete set null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  unique (course_id, student_id)
);

grant all on all tables in schema iam to service_role;
grant all on all tables in schema courses to service_role;
grant select on all tables in schema iam to authenticated;
grant select on all tables in schema courses to authenticated;

-- Al crear un usuario en auth.users, crear su perfil (rol por defecto: alumno)
create or replace function iam.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = iam, public
as $$
begin
  insert into iam.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function iam.handle_new_user();
