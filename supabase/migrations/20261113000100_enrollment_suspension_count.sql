-- Count real transitions to suspended independently of the API used.
alter table courses.enrollments add column if not exists suspension_count integer not null default 0 check (suspension_count >= 0);
-- The current suspension is known; earlier transitions were not recorded.
update courses.enrollments set suspension_count=1 where status='suspended' and suspension_count=0;
create or replace function courses.track_enrollment_suspensions()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op='INSERT' then
    new.suspension_count=case when new.status='suspended' then 1 else 0 end;
  elsif new.status='suspended' and old.status is distinct from 'suspended' then
    new.suspension_count=old.suspension_count+1;
  else
    new.suspension_count=old.suspension_count;
  end if;
  return new;
end;
$$;
create trigger trg_track_enrollment_suspensions before insert or update on courses.enrollments
for each row execute function courses.track_enrollment_suspensions();
revoke all on function courses.track_enrollment_suspensions() from public,anon,authenticated;
notify pgrst, 'reload schema';
