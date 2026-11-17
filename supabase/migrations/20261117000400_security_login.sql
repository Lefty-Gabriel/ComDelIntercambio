-- Private, persistent counters. No passwords or tokens are stored here.
create table iam.login_security (
 key text primary key, failures integer not null default 0,
 window_at timestamptz not null default now(), blocked_until timestamptz,
 lease uuid, lease_until timestamptz, updated_at timestamptz not null default now()
);
alter table iam.profiles add column login_locked_until timestamptz;
create table iam.security_events (
 id bigint generated always as identity primary key, created_at timestamptz not null default now(),
 actor_id uuid, event text not null, route text, status integer
);
alter table iam.login_security enable row level security;
alter table iam.security_events enable row level security;
revoke all on iam.login_security,iam.security_events from public,anon,authenticated;
grant all on iam.login_security,iam.security_events to service_role;
grant usage,select on sequence iam.security_events_id_seq to service_role;
create function iam.begin_login(p_key text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r iam.login_security; token uuid;
begin
 insert into iam.login_security(key) values(p_key) on conflict do nothing;
 select * into r from iam.login_security where key=p_key for update;
 if r.blocked_until>now() then return jsonb_build_object('blocked',true); end if;
 if r.lease_until>now() then return jsonb_build_object('busy',true); end if;
 if r.window_at<now()-interval '15 minutes' or r.blocked_until is not null then
  r.failures=0; r.window_at=now();
 end if;
 token=gen_random_uuid();
 update iam.login_security set failures=r.failures,window_at=r.window_at,blocked_until=null,lease=token,lease_until=now()+interval '2 minutes',updated_at=now() where key=p_key;
 return jsonb_build_object('lease',token);
end;
$$;
create function iam.finish_login(p_key text,p_lease uuid,p_success boolean,p_count_failure boolean default true,p_email text default '')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r iam.login_security;
begin
 select * into r from iam.login_security where key=p_key for update;
 if not found or r.lease is distinct from p_lease then raise exception 'Invalid login lease'; end if;
 r.failures=case when p_success then 0 when p_count_failure then r.failures+1 else r.failures end;
 update iam.login_security set failures=r.failures,lease=null,lease_until=null,
  blocked_until=case when r.failures>=5 then now()+interval '15 minutes' else null end,
  window_at=case when p_success then now() else window_at end,updated_at=now() where key=p_key;
 update iam.profiles set login_locked_until=case when r.failures>=5 then now()+interval '15 minutes' else null end where lower(email)=lower(btrim(p_email));
 insert into iam.security_events(event) values(case when p_success then 'login_success' when r.failures>=5 then 'login_locked' when p_count_failure then 'login_failed' else 'login_provider_error' end);
 return jsonb_build_object('blocked',r.failures>=5);
end;
$$;
create function iam.allow_auth_request(p_key text,p_limit integer,p_seconds integer)
returns boolean language plpgsql security invoker set search_path='' as $$
declare r iam.login_security;
begin
 insert into iam.login_security(key) values(p_key) on conflict do nothing;
 select * into r from iam.login_security where key=p_key for update;
 if r.window_at<now()-make_interval(secs=>p_seconds) then r.failures=0;r.window_at=now();end if;
 update iam.login_security set failures=r.failures+1,window_at=r.window_at,updated_at=now() where key=p_key;
 return r.failures<p_limit;
end;
$$;
revoke all on function iam.begin_login(text),iam.finish_login(text,uuid,boolean,boolean,text),iam.allow_auth_request(text,integer,integer) from public,anon,authenticated;
grant execute on function iam.begin_login(text),iam.finish_login(text,uuid,boolean,boolean,text),iam.allow_auth_request(text,integer,integer) to service_role;
notify pgrst,'reload schema';
