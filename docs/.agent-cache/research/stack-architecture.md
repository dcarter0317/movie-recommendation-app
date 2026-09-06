# Stack landscape check — 2026-09-05

Greenfield TS web app: personalized movie recommender + semantic "vibe" search + LLM-generated text + public SEO marketing site. Solo dev, ship-focused.

## 1. Full-stack React meta-framework

- Next.js 16.x stable; App Router default/mature; Partial Prerendering GA; Turbopack integrated. Biggest ecosystem, Vercel-native. https://nextjs.org
- React Router v7 (Remix merged in, late 2024) — unified loaders/actions. https://react-router.dev
- TanStack Start v1.0 (2026) — end-to-end type safety, newer/smaller ecosystem.
- SvelteKit (Svelte 5 runes) — solid alt, smaller React-shaped hiring pool.

## 2. Managed Postgres, free tier

- Neon — serverless, branching, generous free tier, pairs well with Drizzle/Vercel. https://neon.tech
- Supabase — Postgres + bundled Auth + RLS + storage; generous free tier. https://supabase.com
- Railway/Render Postgres — simple, small monthly credit.
- Pricing shifts month to month; confirm before committing.

## 3. Vector search

- pgvector ~0.8/0.9.x, supported on Neon + Supabase. Production-adequate to ~500k–1M rows for this workload.
- Drizzle has native `cosineDistance`; Prisma 7 pgvector via `postgresqlExtensions` preview + some `$queryRaw`.
- Dedicated (Pinecone serverless, Turbopuffer) only needed at larger scale; pgvector is the cost/complexity leader.
- https://orm.drizzle.team/docs/guides/vector-similarity-search

## 4. TypeScript ORM

- Drizzle v1.0 beta (v0.4x production-ready) — no binaries, serverless/edge-native, SQL-first, native pgvector. https://orm.drizzle.team
- Prisma v7 — Rust-free client, edge viable now, widest adoption, richer introspection. https://www.prisma.io
- Drizzle has momentum for greenfield.

## 5. Auth

- better-auth v1.6 (May 2026) — self-hosted, TS-first, no per-user pricing, passkeys/RBAC/multi-tenant built in. Rising standard for new SaaS. https://www.better-auth.com
- Supabase Auth — free, RLS integration, only compelling if already on Supabase.
- Clerk — hosted, best out-of-box UX, per-MAU pricing, external user store. https://clerk.com
- Auth.js v5 / NextAuth — maintenance mode (security only), 40+ providers, battle-tested but no new features.

## 6. Background jobs (avoid standing Redis)

- Inngest — hosted, TS handlers, durable execution, event-driven, no worker to run, works alongside Vercel. https://www.inngest.com
- Trigger.dev v4 — GA Aug 2025, managed, long-running tasks. https://trigger.dev
- pg-boss / Graphile Worker — Postgres-backed, no extra SaaS, but need a long-lived worker process (not Vercel). https://worker.graphile.org
- BullMQ — needs Redis.

## 7. Hosting

- Vercel — Next.js-native, free Hobby, Pro $20/mo, consumption overages; best Next DX; no long-lived workers. https://vercel.com/pricing
- Fly.io — global, can co-locate app + background worker, bandwidth-priced. https://fly.io
- Railway — simple pricing, small monthly credit, good for small projects + workers.
- Render — free tier + pay-as-you-go.

## 8. Embeddings (Anthropic has NO first-party embedding endpoint)

- OpenAI text-embedding-3-small — industry standard, ~$0.02/1M tokens, mature. https://platform.openai.com/docs/guides/embeddings
- Voyage AI — higher quality/cost, 32k context. https://www.voyageai.com
- Cohere Embed v3 — compression, 512-token context.
- Open: BGE-m3 / bge-large-en-v1.5 — self-host, no per-call cost, needs infra.

## Safe solo-ship path (researcher's summary)

Next.js 16 + Neon Postgres + Drizzle + better-auth + Inngest + Vercel + OpenAI embeddings; Claude for text generation.

## Caveats

Fresher than Jan 2026 cutoff but pricing/minor versions drift. TanStack Start, better-auth, Drizzle v1.0 all newer with rising adoption. Profile pgvector on real data before betting search entirely on it.
