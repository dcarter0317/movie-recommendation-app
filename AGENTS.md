# Reel (movie recommendation app)

## Stack

- **Language / Runtime**: TypeScript (strict mode), Node 22 LTS, pnpm 11
- **Framework**: Next.js 16 (App Router), React 19
- **Key dependencies**: Drizzle ORM + drizzle-kit (Supabase Postgres via `postgres-js`), Clerk (auth), Inngest (background jobs), Vercel AI SDK (OpenAI embeddings + Anthropic Claude Haiku), Tailwind CSS v4 + shadcn/ui, Zod
- **Package manager**: pnpm

Full stack decision and architectural constraints: `docs/specs/0001-stack-and-architecture/index.md`. That spec is the source of truth for this section; do not contradict it.

## Build approach

Tracer Bullet: prove one thin real thread through every layer first, then thicken one segment at a time.

## Commands

```bash
# Install
pnpm install

# Dev server
pnpm dev

# Build
pnpm build

# Test (no runner yet; typecheck is the gate for now)
pnpm typecheck

# Lint
pnpm lint

# Database (Drizzle)
pnpm db:generate   # generate SQL migration from schema.ts
pnpm db:migrate    # apply migrations
pnpm db:studio     # open Drizzle Studio
```

## Specs

Stored in `docs/specs/`. Format: `docs/specs/NNNN-title/index.md`.

## Rules

- Functions are pure by default: same input, same output, no hidden side effects. Push I/O (database, network, Clerk, AI providers) to the edges and keep it explicit.
- Data is immutable: `const`, `readonly`, no in-place mutation. Module-level variables are constants only, no shared mutable state.
- Prefer function composition over classes and inheritance; use a class only when a plain function will not do.
- Prefer `map` / `filter` / `reduce` over imperative loops where it reads more clearly.
- Avoid `null`: use explicit `undefined` with union types. For expected failures return a `Result`-style value or an explicit error; reserve thrown exceptions for truly exceptional cases. Use one documented error-handling pattern across Server Actions, Route Handlers, and Inngest steps.
- Strict TypeScript: no `any`, exhaustive types, explicit return types on exported functions.
- Named exports only, except where Next.js requires a default (pages, layouts, `route.ts` config, middleware).
- Every environment variable is declared and parsed in `src/env.ts` with Zod. No `process.env` access anywhere else.
- Strict folder-by-feature: feature code lives in `src/features/<domain>/` (its Server Actions, queries, and components colocated). Keep `src/lib/<concern>/` minimal, for shared infrastructure wrappers only.
- All routes and jobs run on the Node runtime, never Edge (the Postgres and provider SDKs require it).
- `src/components/` (shared cross feature UI) and `src/components/movie/` (shared movie UI) are a deliberate exception to the folder by feature rule above: UI that every feature imports does not belong to one feature's `src/features/<domain>/`.
- UI conventions: build all UI to `docs/design.md` (the prose source of truth for type, color, spacing, motion, and component usage notes); the design token _values_ are canonical in `src/app/globals.css`. Import `motion` only through `LazyMotion` (as in `SwipeCard`), and use `next-themes` through the `class` attribute.

## Tooling

Choices captured here; `/develop tooling` installs them.

- **Lint & format**: ESLint (`eslint-config-next`, already installed) plus Prettier for formatting.
- **Pre-commit**: run lint, format, and typecheck on every commit; block on failure.
- **Testing gate**: typecheck plus a manual `/check verify` for now. Vitest (unit / integration) and Playwright (end to end) are chosen in spec 0001 and get wired up by `/test`.
- **CI**: not set up yet. Add a basic push check (install, lint, typecheck, test) before opening sign-ups.

## Git

- integration: on
- branch prefix: feat/
- commit: per-milestone

Push and PR creation always confirm first.

## Agent skills

Installed under `.agents/skills/` (every agent reads this dir). One tool per bullet; load the specific sub-skill you need.

- [clerk-setup](.agents/skills/clerk-setup/): `clerk/skills`, auth setup, sessions, webhooks, backend API, custom UI (see also `clerk-nextjs-patterns`, `clerk-webhooks`, `clerk-backend-api`, `clerk-custom-ui`).
- [inngest-setup](.agents/skills/inngest-setup/): `inngest/inngest-skills`, durable background jobs (see also `inngest-durable-functions`, `inngest-steps`, `inngest-events`, `inngest-flow-control`).
- [supabase](.agents/skills/supabase/): `supabase/agent-skills`, Postgres platform, local CLI stack, migrations, RLS (see also `supabase-postgres-best-practices`).
- [drizzle-orm-patterns](.agents/skills/drizzle-orm-patterns/): `giuseppe-trisciuoglio/developer-kit`, schema, queries, relations, migrations, pgvector.
- [ai-sdk](.agents/skills/ai-sdk/): `vercel/ai`, Vercel AI SDK for OpenAI embeddings and Claude generation (see also `migrate-ai-sdk-v6-to-v7`).
- [next-dev-loop](.agents/skills/next-dev-loop/): `vercel/next.js`, Next.js dev workflow and caching (see also `next-cache-components-adoption`, `next-cache-components-optimizer`, `next-partial-prefetching-adoption`).
- [shadcn](.agents/skills/shadcn/): `shadcn-ui/ui`, add and manage shadcn/ui components from registries.
- [playwright-cli](.agents/skills/playwright-cli/): `microsoft/playwright-cli`, drive a real browser for end-to-end tests and `/check verify`.
- [vitest](.agents/skills/vitest/): `antfu/skills`, Vitest unit and integration testing.

MCP servers: Supabase (connected), Vercel (connected), Playwright (connected), shadcn (connected)

## Context files

<!-- Nested AGENTS.md files are listed here as they are created -->

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
