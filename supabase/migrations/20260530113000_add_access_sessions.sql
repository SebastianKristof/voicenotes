create table if not exists mvp_hub.access_sessions (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references mvp_hub.apps(id) on delete cascade,
  token_hash text not null,
  created_ip text,
  last_seen_ip text,
  user_agent text,
  last_seen_user_agent text,
  terminated_at timestamptz,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (app_id, token_hash)
);

create index if not exists access_sessions_app_open_last_seen_idx
  on mvp_hub.access_sessions (app_id, terminated_at, last_seen_at desc);

alter table mvp_hub.access_sessions enable row level security;

create policy access_sessions_service_role_all
on mvp_hub.access_sessions
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
