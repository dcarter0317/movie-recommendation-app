-- Lets the migrating role (`postgres`, the table owner both locally and on
-- a hosted Supabase project) `SET ROLE app_user` for local smoke testing
-- and admin diagnostics. Harmless: `postgres` already owns every table, so
-- this grants no privilege it doesn't already have; it only lets it assume
-- app_user's identity for a query, which is what RLS policies key off of.
GRANT "app_user" TO "postgres";
