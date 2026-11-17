create function support.rename_ticket_option(p_actor_id uuid,p_option_id uuid,p_name text)
returns support.ticket_options language plpgsql security invoker set search_path='' as $$
declare opt support.ticket_options; old_name text;
begin
 perform support.require_actor(p_actor_id,'soporte');
 p_name=btrim(regexp_replace(p_name,'\s+',' ','g'));
 if p_name is null or length(p_name) not between 2 and 32 then raise exception 'Escribe un nombre de 2 a 32 caracteres'; end if;
 select * into opt from support.ticket_options where id=p_option_id and owner_id=p_actor_id for update;
 if not found then raise exception 'No puedes editar esta opción' using errcode='42501'; end if;
 if opt.kind='status' and lower(p_name) in ('pendiente','en atención','resuelto','cerrado') then raise exception 'Ese estado ya existe'; end if;
 old_name=opt.name;
 update support.ticket_options set name=p_name where id=opt.id returning * into opt;
 if opt.kind='status' then
  update support.tickets set custom_status=p_name where custom_status_id=opt.id;
 else
  update support.tickets set labels=array(select distinct unnest(array_replace(labels,old_name,p_name))) where assigned_to=p_actor_id and old_name=any(labels);
 end if;
 return opt;
end;
$$;
revoke all on function support.rename_ticket_option(uuid,uuid,text) from public,anon,authenticated;
grant execute on function support.rename_ticket_option(uuid,uuid,text) to service_role;
notify pgrst,'reload schema';
