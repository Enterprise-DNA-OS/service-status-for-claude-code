create function touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
create table components (
 id uuid primary key default gen_random_uuid(), code text not null unique, name text not null,
 status text not null default 'operational' check(status in ('operational','degraded_performance','partial_outage','major_outage','under_maintenance')),
 owner text not null default '', description text not null default '', reviewed_at timestamptz,
 source_id text unique, source_data jsonb not null default '{}',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table events (
 id uuid primary key default gen_random_uuid(), code text not null unique, name text not null,
 kind text not null check(kind in ('incident','maintenance')),
 status text not null, impact text not null default 'minor' check(impact in ('none','minor','major','critical')),
 owner text not null default '', started_at timestamptz not null default now(), resolved_at timestamptz,
 scheduled_for timestamptz, scheduled_until timestamptz, next_update_at timestamptz,
 source_id text unique, source_data jsonb not null default '{}',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check((kind='incident' and status in ('investigating','identified','monitoring','resolved')) or
 (kind='maintenance' and status in ('scheduled','in_progress','verifying','completed'))),
 check(kind<>'maintenance' or (scheduled_for is not null and scheduled_until>scheduled_for)),
 check(resolved_at is null or resolved_at>=started_at),
 check((status in ('resolved','completed'))=(resolved_at is not null))
);
create table event_components (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references events(id), component_id uuid not null references components(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(event_id,component_id)
);
create index event_components_component_idx on event_components(component_id);
create table updates (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references events(id),
 body text not null check(length(trim(body))>0), status text not null, actor text not null,
 occurred_at timestamptz not null default now(), source_id text unique,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index updates_event_time_idx on updates(event_id,occurred_at desc);
create table subscribers (
 id uuid primary key default gen_random_uuid(), code text not null unique, channel text not null check(channel in ('email','sms','webhook')),
 contact text not null, state text not null default 'review' check(state in ('review','active','opted_out')),
 purpose text not null default '', evidence text not null default '', review_on date,
 source_id text unique, source_data jsonb not null default '{}',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(channel,contact), check(state<>'active' or (purpose<>'' and evidence<>'' and review_on is not null))
);
create table subscriber_components (
 id uuid primary key default gen_random_uuid(), subscriber_id uuid not null references subscribers(id), component_id uuid not null references components(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(subscriber_id,component_id)
);
create index subscriber_components_component_idx on subscriber_components(component_id);
create table activity (
 id uuid primary key default gen_random_uuid(), entity text not null, record_id uuid not null, action text not null, actor text not null,
 before_data jsonb, after_data jsonb, note text not null default '',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index activity_record_idx on activity(record_id,created_at);
create index events_open_deadline_idx on events(next_update_at) where resolved_at is null;
create index subscribers_review_idx on subscribers(review_on);
do $$ declare n text; begin
 foreach n in array array['components','events','event_components','updates','subscribers','subscriber_components','activity'] loop
 execute format('create trigger touch_updated before update on %I for each row execute function touch_updated_at()',n);
 execute format('alter table %I enable row level security',n);
 execute format('revoke all on %I from public',n);
 end loop;
end $$;
create view update_queue with (security_invoker=true) as
 select e.id,e.code,e.name,e.kind,e.status,e.owner,e.next_update_at,
 (select max(u.occurred_at) from updates u where u.event_id=e.id) as last_update_at,
 case when e.owner='' then 'unowned' when e.next_update_at is null then 'no next update' when e.next_update_at<now() then 'overdue' else 'scheduled' end as attention
 from events e where resolved_at is null;
create view maintenance_calendar with (security_invoker=true) as
 select e.id,e.code,e.name,e.status,e.owner,e.scheduled_for,e.scheduled_until,
 string_agg(c.name,', ' order by c.name) as components
 from events e left join event_components ec on ec.event_id=e.id left join components c on c.id=ec.component_id
 where e.kind='maintenance' and e.resolved_at is null group by e.id;
create view service_health with (security_invoker=true) as
 select c.id,c.code,c.name,c.status,c.owner,c.reviewed_at,
 count(e.id) filter(where e.resolved_at is null and e.kind='incident')::integer as open_incidents,
 count(e.id) filter(where e.resolved_at is null and e.kind='maintenance')::integer as maintenance_windows
 from components c left join event_components ec on ec.component_id=c.id left join events e on e.id=ec.event_id group by c.id;
create view subscriber_review with (security_invoker=true) as
 select id,code,channel,state,purpose,review_on,
 case when state='opted_out' then 'retention review' when state='review' then 'permission review'
 when review_on<current_date then 'review overdue' else 'current' end as finding
 from subscribers;
revoke all on update_queue,maintenance_calendar,service_health,subscriber_review from public;
-- No public policies: use a trusted database owner, never a browser role.
