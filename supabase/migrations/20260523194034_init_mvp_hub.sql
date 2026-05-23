create extension if not exists pgcrypto;

create schema if not exists mvp_hub;

create table if not exists mvp_hub.apps (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (slug = lower(slug))
);

create table if not exists mvp_hub.artifacts (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references mvp_hub.apps(id) on delete cascade,
  owner_user_id uuid references auth.users(id) on delete set null,
  source_type text not null default 'manual',
  recording_path text,
  transcript text,
  heading text,
  summary text,
  post text,
  style_profile_name text,
  style_instructions text,
  extra_instructions text,
  length text not null default 'medium',
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_type in ('recording', 'upload', 'manual')),
  check (length in ('short', 'medium', 'long'))
);

create index if not exists artifacts_app_created_idx
  on mvp_hub.artifacts (app_id, created_at desc);

create index if not exists artifacts_owner_created_idx
  on mvp_hub.artifacts (owner_user_id, created_at desc);

create or replace function mvp_hub.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger apps_set_updated_at
before update on mvp_hub.apps
for each row
execute function mvp_hub.set_updated_at();

create trigger artifacts_set_updated_at
before update on mvp_hub.artifacts
for each row
execute function mvp_hub.set_updated_at();

alter table mvp_hub.apps enable row level security;
alter table mvp_hub.artifacts enable row level security;

create policy apps_select_all_authenticated
on mvp_hub.apps
for select
using (auth.role() = 'authenticated');

create policy apps_mutate_service_role
on mvp_hub.apps
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create policy artifacts_select_own
on mvp_hub.artifacts
for select
using (owner_user_id = auth.uid());

create policy artifacts_insert_own
on mvp_hub.artifacts
for insert
with check (owner_user_id = auth.uid());

create policy artifacts_update_own
on mvp_hub.artifacts
for update
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

create policy artifacts_delete_own
on mvp_hub.artifacts
for delete
using (owner_user_id = auth.uid());

create policy artifacts_service_role_all
on mvp_hub.artifacts
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

insert into mvp_hub.apps (slug, name)
values ('voicenotes', 'VoiceNotes')
on conflict (slug) do update set
  name = excluded.name,
  updated_at = now();
