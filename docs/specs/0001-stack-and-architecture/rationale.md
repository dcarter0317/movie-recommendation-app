# 0001. Stack and architecture — rationale

Decision record for [index.md](index.md). `/develop` does not read this file.

## Context

The project is a greenfield personalized movie recommendation web app (working name Reel) with a public marketing site alongside it. There is no code yet and no recorded stack. Every later feature (accounts, swipe onboarding, personalized feed, Letterboxd CSV import, generated reasons, natural language vibe search, watchlist, marketing site) builds on whatever is chosen here, and the cost of changing it rises with each slice shipped.

The forces that shaped the choice:

- **One developer, real product.** The workflow tier is GA (real accounts, real personal taste data), so correctness and operability matter, but there is one person to build and run it. Managed services beat self run infrastructure.
- **Tracer Bullet build approach.** The plan is a thin thread through every layer first (sign in, swipe a few movies, see a feed with a reason), then thicken one segment at a time. The stack must let one person stand up auth, a database, a background job, and a rendered page quickly.
- **Two surfaces.** An interactive authenticated app, plus public marketing pages that must be server rendered so search engines and link previews see real content (feature 13).
- **Semantic search is core, not decoration.** "cozy slow burn sci fi" must rank by meaning, which needs vector embeddings and a nearest neighbour query, from the first search slice.
- **Text generation is on the roadmap.** Feature 10 generates a short written reason per feed pick, grounded in the user's own ratings.
- **Movie data must be sourced.** It needs posters, structured metadata, and enough descriptive text to embed for search.
- **Several jobs are inherently background work.** Importing and refreshing the catalog, embedding the catalog, parsing an uploaded CSV, precomputing reasons.
- **Solo budget.** Free and low tiers now, predictable cost as usage grows.

Consequence of not deciding: no feature can start, and every slice would invent its own storage, auth, and hosting.

## Options considered

### Option 1: Next.js on Vercel, managed Postgres with pgvector, Drizzle, Clerk, Inngest (chosen, with Supabase as the Postgres platform)

Managed services throughout. One relational database that also holds the vectors, hosted identity (Clerk), hosted durable jobs. TMDB for movie data, OpenAI for embeddings and the Claude small model for generation, both reached through the Vercel AI SDK. The public marketing site is a static route group inside the same Next.js app. Neon was the recommended Postgres host in the walk; the engineer chose Supabase's Postgres instead (keeping Clerk for auth, not adopting Supabase Auth or row level security), so the final shape is this option with Supabase in the database slot.

**Pros**:

- Fastest for one person to stand up the whole thread; every piece has a generous free tier.
- One database for relational data and vectors: a movie and its embedding stay consistent, one backup, one connection pool.
- Next.js delivers the SEO rendering feature 13 needs without adding a second framework.
- First party Agent Skills for Clerk, Inngest, and Neon.

**Cons**:

- Six external vendors (four infrastructure, two AI); each is a key, a bill, and an outage mode.
- Clerk is priced per monthly active user and owns the identity record.
- Vercel has no long lived process, so all background work must fit Inngest's model.
- With Supabase in the database slot but Clerk for auth, Supabase Auth and Storage go unused; the platform surface is larger than what is used.

### Option 2: Next.js on Vercel, Supabase (Postgres, Auth, Storage), Drizzle, Inngest

Consolidate database, auth, and file storage into Supabase; keep Next on Vercel and Inngest for jobs.

**Pros**:

- One vendor for database, auth, and storage: fewer keys, one dashboard, row level security available.
- Postgres with pgvector, the same relational and vector story as Option 1.
- Supabase Auth has no per user fee.

**Cons**:

- Row level security is a separate model to learn and get right, and it couples authorization to the database.
- Supabase Auth's hosted flows and UI are less polished than Clerk's; more to build for sign in.
- Still on Vercel, so the same background job constraint; Supabase plus Vercel is two platforms anyway.
- Heavier lock in around the Supabase client and its policies.

### Option 3: One full stack app (app and marketing together), managed Postgres on Railway or Fly, Prisma, better-auth, pg-boss on a long lived worker

A single deployable with route groups for marketing and app, plain managed Postgres, a self hosted auth library, and a Postgres backed queue run by a worker process on a container host.

**Pros**:

- Fewer vendors: one host, one database, no per user auth fee, no hosted job bill.
- A long lived worker can run pg-boss or Graphile Worker directly.
- better-auth keeps the identity record in the same database as the taste data.

**Cons**:

- More to operate: a Dockerfile, a worker process, scaling settings, migrations on deploy, all on the engineer.
- Self hosting auth is more responsibility (upgrades, security patches) for a solo build than a hosted service.
- Railway and Fly are less tuned for Next.js than Vercel (preview deploys, image optimization).

### Option 4: SPA (Vite plus React) plus a standalone Node API, Postgres, a dedicated vector database

A client rendered app talking to a separate API service, with a purpose built vector database (for example Pinecone) for search.

**Pros**:

- Clean split of client and API; the API could serve a future mobile client unchanged.
- A dedicated vector database is strong at large scale hybrid search out of the box.

**Cons**:

- The marketing site and any shareable result pages need SEO, so a client only app forces building a server rendering layer anyway.
- A separate vector store must be kept in sync with Postgres: two writes, two consistency stories, another bill.
- The most infrastructure and glue for the least benefit at this scale; slowest to a working thread.

## Rationale

The deciding force is one developer shipping a real product on the Tracer Bullet approach (basis: `docs/scope/scope.md`, build approach and GA tier): the stack has to make a thin end to end thread cheap to build and cheap to operate. Option 1 does that with managed pieces that each carry a free tier and, for Clerk, Inngest, and Supabase, a first party Agent Skill, so the early slices move fast.

Keeping vectors in the same database as the relational data (Options 1 and 2) beats a separate vector store (Option 4) (basis: keep derived data beside its source until scale forces a split): the catalog is small, and a movie and its embedding staying in one place removes a class of sync bugs. Next.js earns its place because feature 13 needs real server rendered metadata, and Option 4's SPA would mean building that layer by hand (basis: `docs/scope/scope.md`, feature 13).

On auth, the engineer chose hosted Clerk over both Supabase's bundled auth and the recommended self hosted library (better-auth). Clerk is the faster path to polished sign in, sessions, OAuth, and passkeys, which suits the first Tracer Bullet slice. The conscious tradeoffs: Clerk charges per monthly active user, and the identity record lives outside the app database, joined by the Clerk user id and kept in sync by webhook. For a solo build chasing product market fit this is acceptable; if monthly active users reach the thousands before revenue, revisiting auth is cheaper than most migrations because only the `users` sync boundary is affected.

On the database platform, Neon was recommended in the walk (serverless, per environment branching) and the engineer chose Supabase's Postgres instead. Both are managed Postgres with pgvector, so the relational and vector story is identical and Drizzle sits on top of either. Supabase brings a strong local development story (the Supabase CLI runs the whole stack in Docker with one command) and a clear path to Storage later if the app ever needs to persist files. The tradeoff is unused platform surface: with Clerk for auth, Supabase Auth is a paid-for feature the app does not touch. The database access layer changes with the host: the Neon serverless HTTP driver is replaced by `postgres-js` against Supabase's Supavisor pooler (transaction mode, prepared statements off) for request paths, and the direct connection for migrations and Inngest steps.

On authorization, the engineer chose a two layer model: the Server Action or Route Handler is the primary gate (verify the Clerk session, resolve the internal user id, scope the query, return clear errors), and Postgres row level security is a backstop so a missed `where` clause cannot leak another user's data. This is defense in depth for a GA product holding personal taste data. The cost is a per request transaction that sets `app.user_id` for the policies to read, and a deliberate bypass path for Inngest jobs; row level security failing closed (returning no rows) is safe but can look like a bug in development. Cost control follows the same "enforce in Postgres" instinct: a `usage_counters` table with atomic increment gates every per user action that costs money at a provider (vibe search, reason regeneration, imports), rather than trusting the client or an in memory limiter that resets on deploy.

The repository layout was first set as two separate repositories and then reconsidered, after the cross check flagged the standing cost (two Vercel projects, two environment sets, two dependency streams, hand copied design tokens) for a marketing site of only a few pages. The final choice is one Next.js app with a static `(marketing)` route group: one repository, one deploy, shared tokens, with deploy isolation coming from Vercel rollback rather than a project boundary. The route group must stay static and out of the auth middleware to keep that isolation.

Two AI details were settled after the walk. The provider calls go through the Vercel AI SDK (`ai` with `@ai-sdk/openai` and `@ai-sdk/anthropic`) rather than the raw provider SDKs: the app has two AI vendors (embeddings and generation), and the AI SDK gives them one call shape, first class streaming into React, structured output, and a model registry that makes a swap a one line change. The cost is one more dependency on its own release cadence. Generation uses the Claude small model (`claude-haiku-4-5`), because per pick reasons are short and high volume; a larger model stays a per call swap if quality disappoints. Similarity search stays in pgvector inside the primary database (embeddings in a `vector(1536)` column, cosine distance, HNSW index), not a separate vector store, for the same reason given above: the catalog is small and one datastore removes a class of sync bugs.

Boring, proven choices hold elsewhere (basis: monolith and managed services first for a small team): Postgres for relational data, the database's own extension for vectors, a query library for CRUD with raw SQL available for ranking queries, object storage deferred because nothing needs to persist a file yet, and error tracking deferred per the scope.

The remaining picks were pinned by the engineer to remove ambiguity for later features: Tailwind CSS v4 with shadcn/ui for the UI base (utility CSS plus owned, accessible component source built on Radix, copied into the repo rather than a runtime dependency), Zod for all validation (environment, Server Action inputs, webhook payloads, external response narrowing), pnpm on Node 22 for the toolchain, and Vitest plus Playwright as the test runners. Feature 5 builds the design system on top of Tailwind and shadcn/ui, and feature 2 installs and configures the runners and lint or format tooling; the choices themselves are settled here so those features configure rather than decide.

## References

**Project sources** (verifiable, in this repo):

- `docs/scope/scope.md`: the Tracer Bullet build approach, the GA workflow tier, the full feature list every layer must support, and the explicit deferral of product analytics and error monitoring.
- Installed Agent Skills, added during this decision (in `.agents/skills/`): `clerk/skills`, `inngest/inngest-skills`, `supabase/agent-skills`, `shadcn-ui/ui`, `microsoft/playwright-cli`, `vercel/ai`, `vercel/next.js`, `antfu/skills@vitest`, `giuseppe-trisciuoglio/developer-kit@drizzle-orm-patterns`; `neondatabase/agent-skills` was also installed during the walk and left in place though Neon was not chosen.
- MCP servers selected to connect (a user config step, not done by the agent): Supabase MCP, Vercel MCP, Playwright MCP, shadcn MCP.

**Practices & standards**:

- Monolith and managed services first for a small team: fewer moving parts to operate at 2am.
- Keep vectors beside their source rows until scale forces a dedicated store.
- ORM or query library for CRUD, hand written SQL for ranking and aggregation.
- Never build authentication from scratch; use a proven library or service.
- Object storage over database blobs, and only when a file must actually persist.

**Links** (web verified during the 2026-09-05 landscape scan):

- Next.js: https://nextjs.org
- Drizzle: https://orm.drizzle.team
- Drizzle vector similarity search guide: https://orm.drizzle.team/docs/guides/vector-similarity-search
- Inngest: https://www.inngest.com
- Vercel pricing: https://vercel.com/pricing
- OpenAI API pricing (embeddings): https://openai.com/api/pricing
- better-auth (evaluated as the auth runner up): https://www.better-auth.com
- Graphile Worker (evaluated as a background jobs alternative): https://worker.graphile.org

## Supporting evidence

### Landscape scan (2026-09-05)

A single current tool check run before the stack walk. Reflects the state as of that date; treat versions as "verify at scaffold time".

- **Full stack React framework**: Next.js 16.x stable, App Router default and mature, Turbopack integrated. React Router v7 (Remix merged in) and TanStack Start v1.0 are the alternatives; Next has the largest ecosystem and the strongest SEO and metadata story.
- **Managed Postgres**: Neon (serverless, database branching, generous free tier) and Supabase (Postgres plus bundled auth, storage, and row level security) lead. Pricing shifts month to month.
- **Vector search**: pgvector is supported on both Neon and Supabase and is production adequate to roughly 500k to 1M rows for this kind of workload. Drizzle has native cosine distance support. Dedicated vector databases (Pinecone, Turbopuffer) matter only at larger scale.
- **Data access**: Drizzle (SQL first, no binary engine, serverless friendly, native pgvector) has strong greenfield momentum. Prisma 7 (Rust free client now) has the widest adoption and richer tooling.
- **Auth**: better-auth v1.6 (self hosted, TypeScript first, no per user fee) is the rising standard for new TypeScript SaaS. Clerk is hosted with the best out of the box UX and per monthly active user pricing. Auth.js v5 is in maintenance mode.
- **Background jobs without standing up Redis**: Inngest and Trigger.dev are hosted and durable with no worker to run. pg-boss and Graphile Worker are Postgres backed but need a long lived worker process, which a serverless host cannot provide.
- **Hosting**: Vercel is native to Next.js (preview deploys, image optimization, cron) with a free Hobby tier and a $20 per month Pro tier; it has no long lived processes. Fly.io and Railway can co locate an app and a background worker but need more configuration.
- **Embeddings**: Anthropic has no first party embeddings endpoint. OpenAI `text-embedding-3-small` is the cheap mature default; Voyage AI is higher quality and higher cost.

Full scan cached at `docs/.agent-cache/research/stack-architecture.md`.
