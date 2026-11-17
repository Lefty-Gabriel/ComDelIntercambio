create table iam.password_recovery_challenges (
 key text primary key, account_key text not null, expires_at timestamptz not null default now()+interval '1 hour'
);
alter table iam.password_recovery_challenges enable row level security;
revoke all on iam.password_recovery_challenges from public,anon,authenticated;
grant all on iam.password_recovery_challenges to service_role;
create function iam.consume_recovery_challenge(p_key text,p_account_key text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare consumed text;
begin
 delete from iam.password_recovery_challenges where key=p_key and account_key=p_account_key and expires_at>now() returning key into consumed;
 return consumed is not null;
end;
$$;
revoke all on function iam.consume_recovery_challenge(text,text) from public,anon,authenticated;
grant execute on function iam.consume_recovery_challenge(text,text) to service_role;
notify pgrst,'reload schema';
