insert into components(code,name,status,owner,reviewed_at) values
 ('API','Customer API','degraded_performance','Mara',now()-interval '1 day'),
 ('PORTAL','Customer Portal','operational','Jules',now()-interval '2 days'),
 ('FILES','File delivery','partial_outage','',now()-interval '45 days') on conflict(code) do nothing;
insert into events(code,name,kind,status,impact,owner,started_at,next_update_at,scheduled_for,scheduled_until) values
 ('INC-101','Slow order lookups','incident','identified','major','Mara',now()-interval '3 hours',now()-interval '30 minutes',null,null),
 ('INC-102','Delayed file delivery','incident','investigating','minor','',now()-interval '2 hours',null,null,null),
 ('MW-201','Portal database maintenance','maintenance','scheduled','minor','Jules',now(),now()+interval '1 day',now()+interval '2 days',now()+interval '2 days 2 hours'),
 ('MW-202','Portal network change','maintenance','scheduled','minor','Mara',now(),now()+interval '1 day',now()+interval '2 days 1 hour',now()+interval '2 days 3 hours') on conflict(code) do nothing;
insert into event_components(event_id,component_id)
select e.id,c.id from (values ('INC-101','API'),('INC-102','FILES'),('MW-201','PORTAL'),('MW-202','PORTAL')) v(event,component)
join events e on e.code=v.event join components c on c.code=v.component on conflict(event_id,component_id) do nothing;
insert into updates(event_id,body,status,actor,occurred_at,source_id)
select id,'A cache rebuild is underway. Order lookups remain slow.','identified','Mara',now()-interval '90 minutes','demo-update-101' from events where code='INC-101' on conflict(source_id) do nothing;
insert into subscribers(code,channel,contact,state,purpose,evidence,review_on) values
 ('SUB-1','email','ops@harbour.example','active','Service interruption notices','Demo permission record 1',current_date+30),
 ('SUB-2','email','review@kauri.example','review','','',null),
 ('SUB-3','email','former@kauri.example','opted_out','Service interruption notices','Demo opt-out record',current_date-7),
 ('SUB-4','sms','+64000000000','active','Service interruption notices','Demo permission record 4',current_date-2) on conflict(code) do nothing;
insert into subscriber_components(subscriber_id,component_id) select s.id,c.id from subscribers s cross join components c where s.code='SUB-1' and c.code='API' on conflict(subscriber_id,component_id) do nothing;
