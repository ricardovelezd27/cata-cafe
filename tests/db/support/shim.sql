-- Supabase shim for the disposable local Postgres (audit D-05).
--
-- Creates ONLY what prisma/sql/rls_and_triggers.sql, the migrations and the
-- app code expect Supabase to provide. Needs found by reading those files:
--   * roles anon / authenticated / service_role (referenced by GRANT, REVOKE,
--     CREATE POLICY ... TO authenticated, ALTER DEFAULT PRIVILEGES)
--   * schema auth + auth.users (PHASE 1 trigger on_auth_user_created is
--     created ON auth.users; guest merge / admin code reads id, email,
--     is_anonymous, raw_user_meta_data, created_at, last_sign_in_at)
--   * auth.uid() / auth.jwt() reading the request.jwt.claims setting
--     (every policy is written with auth.uid())
--   * publication supabase_realtime (PHASE 8 ALTERs it to add tables)
--   * gen_random_uuid() is core in PG >= 13, so no pgcrypto is needed.
-- Nothing else (no storage, no realtime schema, no vault) is referenced.

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  is_anonymous boolean NOT NULL DEFAULT false,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_sign_in_at timestamptz
);

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(auth.jwt() ->> 'sub', '')::uuid
$$;

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.jwt() TO anon, authenticated, service_role;

CREATE PUBLICATION supabase_realtime;

-- Supabase platform objects that rls_and_triggers.sql references by name:
--   PHASE 18  REVOKE EXECUTE ON FUNCTION public.rls_auto_enable()  (a function
--             Supabase installs with its "auto-enable RLS" event trigger)
--   PHASE 14  GRANT EXECUTE ON FUNCTION handle_new_user() TO supabase_auth_admin
CREATE ROLE supabase_auth_admin NOLOGIN;
CREATE FUNCTION public.rls_auto_enable() RETURNS void LANGUAGE sql AS $$ SELECT 1 $$;

-- Supabase hands every API role the full set of default privileges on objects
-- created by postgres in public (this is what PHASE 24 later REVOKEs writes
-- from, so the shim must reproduce it for that phase to have a real effect).
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
