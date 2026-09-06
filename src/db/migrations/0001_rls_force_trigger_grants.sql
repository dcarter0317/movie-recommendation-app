-- Feature 3 (data model), spec 0002: the pieces Drizzle Kit has no
-- declarative API for yet (FORCE ROW LEVEL SECURITY, a BEFORE UPDATE
-- trigger, and role grants). Everything else lives in schema.ts.

-- FORCE ROW LEVEL SECURITY: a table owner (the role drizzle-kit migrates
-- as) is exempt from its own RLS policies by default, even with RLS
-- enabled. FORCE makes the policies apply to the owner too (a superuser or
-- a BYPASSRLS role still bypasses regardless; app_user is neither).
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_movie_interactions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "taste_profile" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reasons" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "watchlist_items" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "usage_counters" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- app_user: the request path's role. Exactly SELECT/INSERT/UPDATE/DELETE
-- on every user owned table, plus read-only access to the shared catalog.
GRANT USAGE ON SCHEMA public TO "app_user";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "users" TO "app_user";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "user_movie_interactions" TO "app_user";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "taste_profile" TO "app_user";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "reasons" TO "app_user";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "watchlist_items" TO "app_user";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "usage_counters" TO "app_user";--> statement-breakpoint
GRANT SELECT ON TABLE "movies" TO "app_user";--> statement-breakpoint

-- Inngest's catalog import job (feature 4) writes to `movies`, which
-- carries no RLS, over this dedicated bypassrls role, never as app_user
-- and never as the request path's connection.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_inngest') THEN
    CREATE ROLE "app_inngest" WITH BYPASSRLS;
  END IF;
END
$$;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO "app_inngest";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "movies" TO "app_inngest";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "app_inngest";--> statement-breakpoint

-- `updated_at` on `user_movie_interactions` is maintained here, not by
-- Drizzle's `$onUpdate`, which does not fire on the `ON CONFLICT DO
-- UPDATE` path the upsert helper (src/db/interactions.ts) relies on.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER user_movie_interactions_set_updated_at
BEFORE UPDATE ON "user_movie_interactions"
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
