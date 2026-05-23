create extension if not exists pg_trgm;

create table if not exists mvp_hub.styles (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references mvp_hub.apps(id) on delete cascade,
  name text not null,
  instructions text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (app_id, name)
);

create table if not exists mvp_hub.notes (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references mvp_hub.apps(id) on delete cascade,
  source_type text not null default 'manual',
  input_text text not null,
  dictated_text text,
  heading text,
  summary text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_type in ('recording', 'upload', 'manual'))
);

create table if not exists mvp_hub.note_posts (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references mvp_hub.apps(id) on delete cascade,
  note_id uuid not null references mvp_hub.notes(id) on delete cascade,
  post_text text not null,
  length text not null default 'medium',
  extra_instructions text,
  style_id uuid references mvp_hub.styles(id) on delete set null,
  style_name text,
  style_instructions text,
  generation_settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (length in ('short', 'medium', 'long'))
);

create index if not exists styles_app_created_idx
  on mvp_hub.styles (app_id, created_at desc);

create index if not exists notes_app_created_idx
  on mvp_hub.notes (app_id, created_at desc);

create index if not exists notes_app_heading_trgm_idx
  on mvp_hub.notes
  using gin (heading gin_trgm_ops);

create index if not exists notes_app_summary_trgm_idx
  on mvp_hub.notes
  using gin (summary gin_trgm_ops);

create index if not exists note_posts_note_created_idx
  on mvp_hub.note_posts (note_id, created_at desc);

create trigger styles_set_updated_at
before update on mvp_hub.styles
for each row
execute function mvp_hub.set_updated_at();

create trigger notes_set_updated_at
before update on mvp_hub.notes
for each row
execute function mvp_hub.set_updated_at();

alter table mvp_hub.styles enable row level security;
alter table mvp_hub.notes enable row level security;
alter table mvp_hub.note_posts enable row level security;

create policy styles_service_role_all
on mvp_hub.styles
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create policy notes_service_role_all
on mvp_hub.notes
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create policy note_posts_service_role_all
on mvp_hub.note_posts
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create or replace function mvp_hub.find_similar_notes(
  p_app_id uuid,
  p_note_id uuid,
  p_limit int default 5
)
returns table (
  note_id uuid,
  heading text,
  summary text,
  similarity_score real
)
language sql
stable
as $$
  with base as (
    select coalesce(heading, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(input_text, '') as base_text
    from mvp_hub.notes
    where id = p_note_id and app_id = p_app_id
    limit 1
  )
  select
    n.id as note_id,
    n.heading,
    n.summary,
    similarity(
      coalesce(n.heading, '') || ' ' || coalesce(n.summary, '') || ' ' || coalesce(n.input_text, ''),
      b.base_text
    ) as similarity_score
  from mvp_hub.notes n
  cross join base b
  where n.app_id = p_app_id
    and n.id <> p_note_id
  order by similarity_score desc, n.created_at desc
  limit greatest(p_limit, 1);
$$;
