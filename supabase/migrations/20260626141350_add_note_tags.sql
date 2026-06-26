create table if not exists mvp_hub.tags (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references mvp_hub.apps(id) on delete cascade,
  slug text not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (app_id, slug),
  check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create table if not exists mvp_hub.note_tags (
  note_id uuid not null references mvp_hub.notes(id) on delete cascade,
  tag_id uuid not null references mvp_hub.tags(id) on delete cascade,
  app_id uuid not null references mvp_hub.apps(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (note_id, tag_id)
);

create index if not exists tags_app_name_idx
  on mvp_hub.tags (app_id, name);

create index if not exists note_tags_app_tag_idx
  on mvp_hub.note_tags (app_id, tag_id, note_id);

create index if not exists note_tags_note_idx
  on mvp_hub.note_tags (note_id);

create trigger tags_set_updated_at
before update on mvp_hub.tags
for each row
execute function mvp_hub.set_updated_at();

alter table mvp_hub.tags enable row level security;
alter table mvp_hub.note_tags enable row level security;

create policy tags_service_role_all
on mvp_hub.tags
for all
to service_role
using (true)
with check (true);

create policy note_tags_service_role_all
on mvp_hub.note_tags
for all
to service_role
using (true)
with check (true);
