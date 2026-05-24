grant usage on schema mvp_hub to anon, authenticated, service_role;
grant all on all tables in schema mvp_hub to anon, authenticated, service_role;
grant all on all routines in schema mvp_hub to anon, authenticated, service_role;
grant all on all sequences in schema mvp_hub to anon, authenticated, service_role;

alter default privileges for role postgres in schema mvp_hub
  grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema mvp_hub
  grant all on routines to anon, authenticated, service_role;
alter default privileges for role postgres in schema mvp_hub
  grant all on sequences to anon, authenticated, service_role;

alter role authenticator set pgrst.db_schemas = 'public,storage,graphql_public,mvp_hub';
notify pgrst, 'reload config';
