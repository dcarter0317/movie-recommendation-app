CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."reaction_type" AS ENUM('like', 'dislike', 'seen', 'skip');--> statement-breakpoint
CREATE TYPE "public"."reason_source" AS ENUM('generated', 'templated');--> statement-breakpoint
CREATE ROLE "app_user";--> statement-breakpoint
CREATE TABLE "movies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tmdb_id" integer NOT NULL,
	"title" text NOT NULL,
	"release_year" integer,
	"overview" text,
	"genres" text[] DEFAULT '{}'::text[] NOT NULL,
	"keywords" text[] DEFAULT '{}'::text[] NOT NULL,
	"cast_members" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"poster_path" text,
	"embedding" vector(1536),
	"embedding_model" text,
	"embedded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "movies_tmdb_id_unique" UNIQUE("tmdb_id")
);
--> statement-breakpoint
CREATE TABLE "reasons" (
	"user_id" uuid NOT NULL,
	"movie_id" uuid NOT NULL,
	"reason_text" text NOT NULL,
	"source" "reason_source" NOT NULL,
	"model" text,
	"prompt_version" text,
	"based_on_count" integer,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reasons_user_id_movie_id_pk" PRIMARY KEY("user_id","movie_id")
);
--> statement-breakpoint
ALTER TABLE "reasons" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "taste_profile" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"embedding" vector(1536),
	"embedding_model" text,
	"based_on_count" integer DEFAULT 0 NOT NULL,
	"last_computed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "taste_profile" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "usage_counters" (
	"user_id" uuid NOT NULL,
	"resource" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "usage_counters_user_id_resource_window_start_pk" PRIMARY KEY("user_id","resource","window_start"),
	CONSTRAINT "usage_counters_resource_check" CHECK ("usage_counters"."resource" in ('vibe_search', 'reason_regeneration', 'letterboxd_import'))
);
--> statement-breakpoint
ALTER TABLE "usage_counters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_movie_interactions" (
	"user_id" uuid NOT NULL,
	"movie_id" uuid NOT NULL,
	"reaction_type" "reaction_type",
	"rating" numeric(2, 1),
	"dismissed_at" timestamp with time zone,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_movie_interactions_user_id_movie_id_pk" PRIMARY KEY("user_id","movie_id"),
	CONSTRAINT "user_movie_interactions_source_check" CHECK ("user_movie_interactions"."source" in ('swipe', 'letterboxd_import', 'manual_rating')),
	CONSTRAINT "user_movie_interactions_rating_range_check" CHECK ("user_movie_interactions"."rating" is null or ("user_movie_interactions"."rating" between 0.5 and 5.0)),
	CONSTRAINT "user_movie_interactions_rating_half_step_check" CHECK ("user_movie_interactions"."rating" is null or ("user_movie_interactions"."rating" * 2 = trunc("user_movie_interactions"."rating" * 2))),
	CONSTRAINT "user_movie_interactions_has_signal_check" CHECK ("user_movie_interactions"."reaction_type" is not null or "user_movie_interactions"."rating" is not null or "user_movie_interactions"."dismissed_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "user_movie_interactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_user_id_unique" UNIQUE("clerk_user_id")
);
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "watchlist_items" (
	"user_id" uuid NOT NULL,
	"movie_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watchlist_items_user_id_movie_id_pk" PRIMARY KEY("user_id","movie_id")
);
--> statement-breakpoint
ALTER TABLE "watchlist_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reasons" ADD CONSTRAINT "reasons_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reasons" ADD CONSTRAINT "reasons_movie_id_movies_id_fk" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taste_profile" ADD CONSTRAINT "taste_profile_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_movie_interactions" ADD CONSTRAINT "user_movie_interactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_movie_interactions" ADD CONSTRAINT "user_movie_interactions_movie_id_movies_id_fk" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_movie_id_movies_id_fk" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "movies_genres_idx" ON "movies" USING gin ("genres");--> statement-breakpoint
CREATE INDEX "movies_keywords_idx" ON "movies" USING gin ("keywords");--> statement-breakpoint
CREATE INDEX "user_movie_interactions_dismissed_idx" ON "user_movie_interactions" USING btree ("user_id") WHERE "user_movie_interactions"."dismissed_at" is not null;--> statement-breakpoint
CREATE INDEX "watchlist_items_user_added_idx" ON "watchlist_items" USING btree ("user_id","added_at" DESC NULLS LAST);--> statement-breakpoint
CREATE POLICY "reasons_owner_access" ON "reasons" AS PERMISSIVE FOR ALL TO "app_user" USING ("reasons"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid) WITH CHECK ("reasons"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "taste_profile_owner_access" ON "taste_profile" AS PERMISSIVE FOR ALL TO "app_user" USING ("taste_profile"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid) WITH CHECK ("taste_profile"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "usage_counters_owner_access" ON "usage_counters" AS PERMISSIVE FOR ALL TO "app_user" USING ("usage_counters"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid) WITH CHECK ("usage_counters"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "user_movie_interactions_owner_access" ON "user_movie_interactions" AS PERMISSIVE FOR ALL TO "app_user" USING ("user_movie_interactions"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid) WITH CHECK ("user_movie_interactions"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "users_self_access" ON "users" AS PERMISSIVE FOR ALL TO "app_user" USING ("users"."id" = nullif(current_setting('app.user_id', true), '')::uuid) WITH CHECK ("users"."id" = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "watchlist_items_owner_access" ON "watchlist_items" AS PERMISSIVE FOR ALL TO "app_user" USING ("watchlist_items"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid) WITH CHECK ("watchlist_items"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid);