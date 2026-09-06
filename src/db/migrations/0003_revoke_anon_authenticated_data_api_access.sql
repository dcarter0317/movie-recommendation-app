-- This app never uses Supabase's Data API (PostgREST/anon key): auth is
-- Clerk, not Supabase Auth, and every request reaches Postgres through the
-- Next.js server as app_user/app_inngest (spec 0001, spec 0002). A
-- Supabase project's "auto-expose new tables" default grants anon and
-- authenticated full CRUD on every table created here, including
-- `movies`, which deliberately carries no RLS (a public read-only
-- catalog) and was therefore openly writable over the public anon key.
-- Close both the existing exposure and the default that would reopen it
-- on the next table.

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL PRIVILEGES ON SCHEMA public FROM anon, authenticated;--> statement-breakpoint

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;--> statement-breakpoint

-- Harden the trigger function against a mutable search_path (Supabase
-- security advisor: function_search_path_mutable).
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
