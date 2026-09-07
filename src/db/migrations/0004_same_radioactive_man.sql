ALTER TABLE "movies" ADD COLUMN "release_date" date;--> statement-breakpoint
ALTER TABLE "movies" ADD COLUMN "runtime" integer;--> statement-breakpoint
ALTER TABLE "movies" ADD COLUMN "vote_average" numeric(3, 1);--> statement-breakpoint
ALTER TABLE "movies" ADD COLUMN "vote_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "movies" ADD COLUMN "popularity" real;--> statement-breakpoint
ALTER TABLE "movies" ADD COLUMN "original_language" text;--> statement-breakpoint
ALTER TABLE "movies" ADD COLUMN "tmdb_status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "movies" ADD COLUMN "embedding_input_hash" text;--> statement-breakpoint
ALTER TABLE "movies" ADD COLUMN "last_refreshed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "movies_embedding_null_idx" ON "movies" USING btree ("id") WHERE "movies"."embedding" is null;--> statement-breakpoint
ALTER TABLE "movies" ADD CONSTRAINT "movies_tmdb_status_check" CHECK ("movies"."tmdb_status" in ('active', 'disqualified', 'removed'));--> statement-breakpoint
-- Spec 0003, AC-8: the Inngest catalog jobs connect on the unpooled
-- connection as the migrating role (`postgres`, both locally and on hosted
-- Supabase) and run every write inside a transaction that first does
-- `SET LOCAL ROLE app_inngest`. `postgres` needs membership in `app_inngest`
-- to assume it. `app_inngest` is a BYPASSRLS role created in migration 0001;
-- `movies` carries no RLS, so this grants no new data access, only the
-- ability to run catalog writes under that identity. Mirrors migration 0002
-- (`GRANT "app_user" TO "postgres"`).
GRANT "app_inngest" TO "postgres";