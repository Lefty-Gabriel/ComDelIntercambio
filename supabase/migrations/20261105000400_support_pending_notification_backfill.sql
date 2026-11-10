-- Messages received before agent notifications were enabled still need an inbox event.
insert into support.agent_notifications(ticket_id,agent_id,title,description,created_at)
select t.id,t.assigned_to,
 case when t.assigned_to is null then 'Nueva solicitud de soporte' else 'El estudiante respondió tu ticket' end,
 t.subject || ': ' || left(m.body,200),m.created_at
from support.messages m join support.tickets t on t.id=m.ticket_id
where m.sender_id=t.student_id and t.status::text in ('open','in_progress')
 and not exists(select 1 from support.agent_notifications n where n.ticket_id=t.id and n.created_at=m.created_at);
