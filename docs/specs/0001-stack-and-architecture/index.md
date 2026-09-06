# 0001. Stack and architecture for the movie recommendation app

**Date**: 2026-09-05
**Status**: In Progress

## Summary

This fixes the foundation every later feature builds on: the app is a Next.js (React) web app written in TypeScript, deployed on Vercel, with a Supabase Postgres database accessed through the Drizzle query library. Sign in is handled by Clerk (a hosted accounts service). Semantic "vibe" search lives in the same database using pgvector (a Postgres extension that stores and compares meaning vectors), background work (catalog import, embedding, CSV parsing) runs on Inngest (a hosted durable job service), movie data comes from the TMDB API, search embeddings come from OpenAI, and written explanations come from Anthropic Claude's small model, both reached through the Vercel AI SDK (one library for calling AI models). The public marketing site is not a separate project: it is a static route group inside the same Next.js app, so there is one repository, one deploy, and shared design tokens. The UI is built with Tailwind CSS v4 and shadcn/ui components, and tests run on Vitest and Playwright. Everything chosen has a free or low starting tier, so a single developer can stand up a thin working thread fast and add to it slice by slice.

## Decision

**Chosen option**: Option 1 modified: Next.js on Vercel, Supabase Postgres with pgvector, Drizzle, Clerk, Inngest.

Build the app as a single Next.js (App Router) service on Vercel, backed by one Supabase Postgres database that also holds vector embeddings via pgvector, with Drizzle for data access, Clerk for identity and sessions, and Inngest for background jobs. Supabase is used as the Postgres platform only; its bundled Auth is not used (auth is Clerk). Authorization is enforced primarily in Server Actions and Route Handlers, with Postgres row level security enabled as a backstop. Use TMDB for movie data, OpenAI `text-embedding-3-small` for embeddings, and the Claude small model (`claude-haiku-4-5`) for generated text, both AI providers reached through the Vercel AI SDK. The public marketing site is a static route group inside this same app, not a separate project. Defer object storage and dedicated error tracking until a real need appears.

**Implementation skills**: `clerk-setup`, `clerk-nextjs-patterns`, `clerk-webhooks`, `clerk-backend-api`, `clerk-custom-ui` (`clerk/skills`, `.agents/skills/`) · `inngest-setup`, `inngest-durable-functions`, `inngest-steps`, `inngest-events` (`inngest/inngest-skills`, `.agents/skills/`) · `supabase`, `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/`) · `shadcn` (`shadcn-ui/ui`, `.agents/skills/`) · `playwright-cli` (`microsoft/playwright-cli`, `.agents/skills/`) · `ai-sdk`, `migrate-ai-sdk-v6-to-v7` (`vercel/ai`, `.agents/skills/`) · `next-dev-loop`, `next-cache-components-adoption`, `next-cache-components-optimizer`, `next-partial-prefetching-adoption` (`vercel/next.js`, `.agents/skills/`) · `drizzle-orm-patterns` (`giuseppe-trisciuoglio/developer-kit`, `.agents/skills/`) · `vitest` (`antfu/skills`, `.agents/skills/`)

## Proposed stack

| Layer                       | Choice                                                                                                                                | Reason                                                                                                                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language                    | TypeScript, strict mode                                                                                                               | One language across the whole app, typed from the database row to the API response.                                                                                                                                  |
| App framework               | Next.js (App Router) with React                                                                                                       | Mature server rendering and metadata support that feature 13 (marketing SEO) needs, largest ecosystem, native to the chosen host.                                                                                    |
| App and marketing site      | One Next.js app: an authed route group for the product, a static (force static) `(marketing)` route group for the public pages        | One repository, one deploy, shared design tokens; deploy isolation still comes from Vercel instant rollback. Avoids the standing cost of a second project.                                                           |
| Rendering and API shape     | React Server Components, Server Actions for user driven mutations, Route Handlers for webhooks and JSON endpoints (feed, vibe search) | No extra remote call layer for a small set of operations; webhooks and search or feed endpoints get plain handlers.                                                                                                  |
| UI stack                    | Tailwind CSS v4 plus shadcn/ui                                                                                                        | Utility CSS on the v4 engine; shadcn/ui provides owned, accessible component source (built on Radix primitives) copied into the repo rather than a dependency. Feature 5 builds the design tokens and system on top. |
| Testing                     | Vitest (unit and integration) plus Playwright (end to end)                                                                            | Vitest runs fast against the ESM toolchain; Playwright drives a real browser for the onboarding, feed, and search flows. Feature 2 installs and configures both.                                                     |
| Primary database            | Supabase Postgres                                                                                                                     | Relational data (users, ratings, reactions, watchlist) with transactions and joins, a free tier, pgvector available, and a full local stack through the Supabase CLI.                                                |
| Vector search               | pgvector extension inside the same Supabase database                                                                                  | Meaning based search without a second datastore to keep in sync; fine for a catalog in the tens of thousands of rows.                                                                                                |
| Data access                 | Drizzle query library with `drizzle-kit` migrations                                                                                   | SQL first with no binary engine, a real `vector` column type, and cosine distance built in for search ranking.                                                                                                       |
| Auth                        | Clerk (hosted)                                                                                                                        | Fastest path to sign in, sessions, OAuth and passkeys; the app `users` row keys off the Clerk user id and is kept in sync by webhook.                                                                                |
| Background jobs             | Inngest (hosted)                                                                                                                      | Durable multi step jobs with automatic retries for catalog import and refresh, batch embedding, Letterboxd CSV parsing, and reason precompute, with no worker process to run next to a serverless host.              |
| Movie data source           | TMDB API                                                                                                                              | Free with attribution, CDN hosted posters, plus genres, cast, and keyword tags that give search embeddings real signal.                                                                                              |
| AI SDK                      | Vercel AI SDK (`ai`) with `@ai-sdk/openai` and `@ai-sdk/anthropic`                                                                    | One call shape for both AI providers (`embedMany` for embeddings, `generateText` / `generateObject` / `streamText` for Claude), first class streaming into React, and model swaps without touching call sites.       |
| Embeddings                  | OpenAI `text-embedding-3-small`, via the AI SDK                                                                                       | Cheap enough to embed the whole catalog and every query; isolated behind one function so a larger model is an easy swap later.                                                                                       |
| Text generation             | Anthropic Claude `claude-haiku-4-5` (the small model), via the AI SDK                                                                 | Powers feature 10 (generated reasons); small model keeps per pick cost low, prompt caching holds the shared taste profile context. A larger Claude model is a per call swap if reason quality disappoints.           |
| File storage                | None for now                                                                                                                          | Letterboxd CSVs are parsed as they stream in and discarded; posters are served straight from the TMDB CDN. Add object storage only when something must persist.                                                      |
| Hosting                     | Vercel, one project for the whole app                                                                                                 | Native to Next.js: a preview deploy per branch, image optimization, scheduled functions.                                                                                                                             |
| Observability               | Vercel, Inngest, and Supabase dashboards for now                                                                                      | Dedicated error tracking and product analytics are deferred in the scope; revisit when real sign ups open.                                                                                                           |
| Package manager and runtime | pnpm on Node 22 LTS                                                                                                                   | Fast, disk efficient installs; pinned with `.nvmrc` and `engines`.                                                                                                                                                   |
| Validation                  | Zod                                                                                                                                   | One schema tool for environment parsing, Server Action inputs, webhook payloads, and narrowing TMDB responses.                                                                                                       |

## Scaffold shape

Not a build plan (`/develop` derives the steps), just the shape the scaffold should take so the scope's "boots locally and passes build" is checkable:

- **One repository, one app.** The public marketing pages are a route group in the same Next.js app.
- **Directory layout**: `src/app` for routes, with a `(marketing)` route group (static, public) and an `(app)` route group (behind Clerk); `src/db` for `schema.ts`, `client.ts`, and `migrations/`; `src/lib/tmdb` for the TMDB fetch wrapper (timeout and retry), `src/lib/ai` for the Vercel AI SDK model registry (the OpenAI embedding model and the Claude generation model in one place), `src/lib/inngest` for the client, plus Clerk helpers; `src/features/<domain>` for feature modules (onboarding, feed, import, search, watchlist); `src/components/ui` for the shadcn/ui components copied into the repo; and `src/env.ts` for the typed environment module.
- **Health check**: a `GET /api/health` route that returns `{ ok: true }` and pings the database, so a local boot can be verified.
- **Platform routes**: `/api/inngest` for the Inngest handler, `/api/webhooks/clerk` for user sync (feature 6 fills in the body).
- **Config**: a `.env.example` listing every key below; `src/env.ts` parses and types them with Zod at startup.
- **Local database**: the Supabase CLI local stack (`supabase start`), which runs Postgres with pgvector in Docker; a hosted Supabase project backs each deployed environment.
- **Environment keys**: `DATABASE_URL` (Supavisor transaction pooler, port 6543), `DATABASE_URL_UNPOOLED` (direct connection, port 5432, for migrations and Inngest steps), `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `TMDB_API_READ_ACCESS_TOKEN`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`.

## Architectural constraints

Decisions this spec fixes so later feature specs (data model, accounts, catalog, vibe search) do not have to guess or churn the schema.

**Database access**:

- Request paths connect through `drizzle-orm/postgres-js` (the `postgres` client) against Supabase's Supavisor pooler in transaction mode (`DATABASE_URL`, port 6543), with prepared statements disabled (`prepare: false`).
- Every authed unit of work runs inside a short transaction that first calls `select set_config('app.user_id', $internalUserId, true)`, so row level security policies can read the current user with `current_setting('app.user_id')`. This works in transaction pooling mode because the setting is transaction local. A shared `withUser(db, userId, fn)` helper wraps this.
- Inngest steps and migrations use the same `postgres-js` driver on `DATABASE_URL_UNPOOLED` (the direct connection, port 5432). Jobs that must bypass row level security use a dedicated role or a `bypassrls` connection, not the request path helper.
- All routes and jobs run on the Node runtime, never the Edge runtime: the Postgres driver and the provider SDKs require it.
- Migrations: `drizzle-kit generate` produces SQL that is committed to the repo. A CI or manual `db:migrate` step applies it against `DATABASE_URL_UNPOOLED` before a deploy is promoted. Never apply migrations on app boot or in `postinstall`, and never run `drizzle-kit push` outside local development.
- Vercel functions are pinned to the `iad1` region and the Supabase project to a matching region (for example AWS `us-east-1`), so the app and the database sit together.

**Identity and authorization**:

- The `users` table has an internal `uuid` primary key and a `clerk_user_id text unique not null` column. Every other table's foreign key points at the internal id, never at the Clerk id. Feature 3 owns the table; this is the shape it must use.
- A `users` row is created by a lazy upsert on the first authenticated request (the source of truth). The Clerk webhook (`/api/webhooks/clerk`) is reconciliation only, not the sole path. This removes the orphaned or missing row risk noted in Consequences.
- The primary authorization gate is the Server Action or Route Handler: it verifies the Clerk session (`clerkMiddleware` guards the authed route group), resolves the internal user id, and scopes every query to it. No mutation or read of user owned data happens without passing that gate.
- Row level security is the backstop, not the primary control. Every user owned table has RLS enabled with a policy of the form `user_id = current_setting('app.user_id')::uuid`, so a missed `where` clause or a future code path cannot leak another user's rows. Feature 3 writes the policies; feature 6 wires the `app.user_id` setting into the request transaction.

**Search and embeddings** (feature 4 and feature 11 own the detail; this is the contract):

- The embedding column is `vector(1536)` (the dimension of `text-embedding-3-small`), compared with cosine distance (`vector_cosine_ops`), with an HNSW index created from the start, not deferred.
- Embeddings are generated with `embedMany` from `@ai-sdk/openai`. The text embedded per movie is a fixed string: title, year, overview, genres, top keyword tags, and top five cast members. The `movies` table carries `embedding_model` and `embedded_at` columns so a model change is detectable and the catalog can be re embedded incrementally.
- The `movies` table carries `tmdb_id integer unique not null` as the natural key, so re importing from TMDB is idempotent.

**External API calls**:

- OpenAI and Anthropic are called only through the Vercel AI SDK (`ai` with `@ai-sdk/openai` and `@ai-sdk/anthropic`), never a raw provider SDK, so there is one place to set models, retries, and provider options (including Anthropic prompt caching). Configure the SDK with `maxRetries: 3`; wrap calls in the same 10 second timeout and exponential backoff with jitter, retrying only on HTTP 429, 5xx, or a network error.
- TMDB is a direct `fetch` wrapper with the same 10 second timeout, 3 attempts, and backoff policy.
- Bulk work (catalog import, batch embedding via `embedMany`) runs inside Inngest steps using its `concurrency` and `throttle` controls rather than hand rolled rate limiters. Catalog import fans out one event per TMDB result page, not one long running job.

**Cost containment** (code level, not just a billing alert):

- Generated reasons are precomputed and cached per `(user, movie)` row; they are never generated on the request path during a render.
- Every per user action that costs money at a provider is quota limited in Postgres: a `usage_counters` table keyed by `(user_id, resource, window_start)` with an atomic increment and check before the call. Initial limits: vibe search 30 per hour, on demand reason regeneration 50 per day, Letterboxd import 3 per day. Feature 3 owns the table; the limits are config, not schema.

**Configuration**:

- All environment variables are declared in one `src/env.ts` module and parsed with Zod at process start. A missing or malformed required variable throws before the app serves a request; there is no `process.env.X` access anywhere else in the code.

**Secrets and local development**:

- Vercel environment variables (one project) are the source of truth for secrets; `vercel env pull` populates local.
- Local development runs against the Supabase CLI local stack (`supabase start`), the `inngest dev` local server, and Clerk development instance keys, all free. A hosted Supabase free project backs the deployed preview and production environments.
- The `(marketing)` route group must render statically: it stays out of the `clerkMiddleware` matcher, uses `export const dynamic = 'force-static'` (or equivalent), and pulls no per request or authed data, so a product outage cannot take the public pages down.

## Consequences

**Positive**:

- Every later slice builds on one relational database: feed, search, import, and watchlist all query the same store, with one backup and one connection pool.
- Managed services throughout (Supabase, Clerk, Inngest, Vercel): nothing to patch or keep running, and each has a free tier that covers the early build.
- Keeping vectors in the primary database means a movie and its embedding move together and cannot drift out of sync.
- TypeScript plus Drizzle plus Zod gives one type chain from the database row to the API response, and env config is validated at startup so a misconfigured deploy fails fast instead of at first use.
- Authorization is defended twice: the Server Action gate for intent and clear errors, row level security so a coding mistake cannot leak another user's data.
- The Supabase CLI gives a full local Postgres (with pgvector) in one command, so local development needs no cloud connection.
- The Vercel AI SDK gives one call shape for both AI providers and makes the embedding and generation models swappable from a single registry file.
- First party Agent Skills exist for Clerk, Inngest, and Supabase, so the build follows their real conventions.

**Negative / tradeoffs**:

- Six external vendors (four infrastructure, two AI). Each is a key to manage, a bill to watch, and an outage or rate limit to design around.
- Clerk charges per monthly active user and holds the identity record. The app joins its data to Clerk by id and relies on webhook delivery to stay in sync; a missed webhook means an orphaned or missing `users` row.
- Supabase's Auth, Storage, and Realtime go unused while auth is Clerk; if Supabase Auth ever looks attractive later, moving off Clerk is a real migration.
- Row level security as a backstop has a real cost: every user owned table needs a policy, every authed request must run in a transaction that sets `app.user_id`, and Inngest jobs need a deliberate bypass path. A wrong or missing policy fails closed (no rows), which is safe but can look like a bug during development.
- The marketing pages share the app's repository and deploy, so a broken app build blocks a marketing copy change until it is fixed, and the marketing route group must be kept disciplined (static, no authed data, out of the auth middleware) or it loses its isolation. Deploy rollback on Vercel is the safety net.
- OpenAI (embeddings) and Anthropic (generation) are different vendors from each other and from the host: two AI bills and two dashboards, even behind one SDK.
- The Vercel AI SDK is another dependency on its own release cadence; a breaking change in `ai` or a provider package touches every AI call site.
- Vercel cannot run a long lived process, so all background work must fit Inngest's step model; a job needing a persistent connection or a very long runtime would force a rethink.
- pgvector is comfortable at tens of thousands of rows but will need an index (HNSW) and tuning past a few hundred thousand.
- `text-embedding-3-small` is the small model; if vibe queries rank poorly, moving to a larger model means re embedding the whole catalog.

**Neutral**:

- New conventions to learn: the Supabase CLI local workflow, Drizzle schema and migrations, Postgres row level security policies and the `app.user_id` transaction pattern, Inngest step functions, Clerk middleware and webhooks, the Vercel AI SDK model and streaming APIs, and the App Router server and client split.
- The CSS and component base (Tailwind v4, shadcn/ui) is fixed here; feature 5 (design system) defines the tokens, theme, and usage conventions on top.
- Lint, format, type strictness, and test runner configuration are deferred to feature 2 (the runners, Vitest and Playwright, are chosen here).
- The marketing pages (feature 13) build on this same app; only the shared framework and hosting choice is settled here, not their content or layout.

## Follow-up

- [ ] Feature 5 (design system) defines the design tokens, theme, and component usage conventions on top of Tailwind v4 and shadcn/ui (the CSS and component base is settled here).
- [ ] Feature 2 (coding standards and tooling) installs and configures lint, format, type strictness, pre commit hooks, and the Vitest and Playwright runners against this real scaffold (the runners are chosen here).
- [ ] Feature 3 (data model) designs the entities and writes the row level security policies and the `usage_counters` table; this spec fixes that they live in one Supabase Postgres database, keyed to the internal user id, with a pgvector column on movies.
- [ ] Feature 6 (accounts and sign in) designs the Clerk to `users` webhook sync, session handling, and the `withUser` helper that opens the request transaction and sets `app.user_id`.
- [ ] Connect these MCP servers in your MCP client settings (for example `claude mcp add`); they are used automatically once connected: **Supabase MCP** (query, schema, DB branches, migrations), **Vercel MCP** (deployments, build logs, env), **Playwright MCP** (drive a real browser for `/check verify` and `/run`), **shadcn MCP** (add components from registries).
- [ ] Set a spend alert or budget cap per vendor dashboard (Supabase, Clerk, OpenAI, Anthropic, Inngest, Vercel) before opening sign ups; the code level controls (cached reasons, per user search rate limit) are in the Architectural constraints and are not deferred.
- [ ] Run `/audit` to write the root `AGENTS.md` from this real scaffold, including an `## Agent skills` section for the installed skills (Clerk, Inngest, Supabase, shadcn/ui, Playwright, Vercel AI SDK, Next.js, Drizzle patterns, Vitest) and an `MCP servers:` line for the connected ones.

## Rationale

Reasoning, options considered, and references: see [rationale.md](rationale.md).
