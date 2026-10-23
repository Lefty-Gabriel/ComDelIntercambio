-- Real dashboard data shared by students, mentors and administrators.

create table courses.student_lesson_notes (
  student_id uuid not null references iam.profiles (id) on delete cascade,
  lesson_id uuid not null references courses.lessons (id) on delete cascade,
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (student_id, lesson_id),
  constraint student_lesson_notes_content_length
    check (char_length(content) <= 20000)
);

create table courses.lesson_questions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references courses.lessons (id) on delete cascade,
  student_id uuid not null references iam.profiles (id) on delete cascade,
  question text not null,
  status text not null default 'pending',
  mentor_reply text,
  answered_by uuid references iam.profiles (id) on delete set null,
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lesson_questions_question_length
    check (char_length(trim(question)) between 3 and 2000),
  constraint lesson_questions_reply_length
    check (mentor_reply is null or char_length(trim(mentor_reply)) between 2 and 5000),
  constraint lesson_questions_status_check
    check (status in ('pending', 'answered')),
  constraint lesson_questions_answer_state_check
    check (
      (
        status = 'pending'
        and mentor_reply is null
        and answered_by is null
        and answered_at is null
      )
      or
      (
        status = 'answered'
        and mentor_reply is not null
        and answered_by is not null
        and answered_at is not null
      )
    )
);

create index student_lesson_notes_updated_idx
  on courses.student_lesson_notes (student_id, updated_at desc);

create index lesson_questions_student_created_idx
  on courses.lesson_questions (student_id, created_at desc);

create index lesson_questions_lesson_status_idx
  on courses.lesson_questions (lesson_id, status, created_at desc);

alter table courses.student_lesson_notes enable row level security;
alter table courses.lesson_questions enable row level security;

revoke all on courses.student_lesson_notes from public, anon, authenticated;
revoke all on courses.lesson_questions from public, anon, authenticated;

grant all on courses.student_lesson_notes to service_role;
grant all on courses.lesson_questions to service_role;
