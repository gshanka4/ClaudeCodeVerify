-- Render/managed Postgres: the connection user must be a member of app_user
-- before the API can run `SET LOCAL ROLE app_user` (withTenant / RLS).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    EXECUTE format('GRANT app_user TO %I', current_user);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
