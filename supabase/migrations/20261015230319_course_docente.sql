-- ============================================================================
-- Traction - asignacion de docente a curso
-- El admin asigna el docente responsable de cada curso.
-- created_by queda como auditoria (quien creo el curso).
-- ============================================================================

alter table courses.courses
  add column docente_id uuid references iam.profiles (id) on delete set null;

create index courses_docente_id_idx on courses.courses (docente_id);
