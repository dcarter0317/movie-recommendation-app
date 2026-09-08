# 0006. Accounts and sign in

**Date**: 2026-09-07
**Status**: Proposed

## Summary

This feature lets a film fan create an account, sign in and out, and stay signed in across visits, and gives the app a stable internal user id that every later slice hangs its data off. Identity and sessions are handled by Clerk (a hosted accounts service), already chosen in spec 0001; this feature wires it in. The sign in and sign up screens use Clerk's prebuilt components, restyled to match the app's own look. On a user's first signed in request the app resolves one small `users` row keyed to their Clerk id through a privileged database function, and every signed in request runs its database work as a restricted role with the current user id set, so the row level security from spec 0002 actually applies. Users can manage their sign in methods and permanently delete their account from an `/account` page.

## Requirements

**User stories**:
- As a film fan, I want to create an account and sign in, so my taste, feed, and lists are saved to me and nobody else.
- As a returning user, I want to stay signed in, so I do not re-authenticate on every visit.
- As a user, I want to manage my sign in methods and delete my account, so I stay in control of my data.
- As the system, I need a stable internal user id resolved on the first signed in request, so every feature can scope data without waiting on a webhook.
- As the operator, I need every signed in request to set the row level security user context, so a missed `where` clause cannot leak another user's rows.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):
- **AC-1**: A visitor can create an account with email plus password, an emailed one time code, or Google OAuth. An email based sign up must confirm the emailed code before reaching any `(app)` route; a Google sign up arrives already verified.
- **AC-2**: A returning user can sign in with any method registered on their account (including a passkey enrolled later) and sign out from any signed in page; after sign out they land on the public marketing landing page (`/`).
- **AC-3**: A signed in user stays signed in across browser restarts and return visits for the life of Clerk's rolling session, without re-entering credentials.
- **AC-4**: Every route under the `(app)` group and every non public API route requires a valid session; an unauthenticated page request is redirected to `/sign-in`. The `(marketing)` routes, `/sign-in`, `/sign-up`, `/onboarding`, `/account`, `/styleguide`, `/api/health`, `/api/webhooks/(.*)`, and `/api/inngest` stay reachable with no session (the last three respond on their own terms; the page routes render).
- **AC-5**: On a user's first authenticated request the app resolves a stable internal `users.id` (uuid), creating the row when it does not exist through one idempotent database call keyed on `clerk_user_id`. Two concurrent first requests create exactly one row and neither errors.
- **AC-6**: Every authenticated Server Action and Route Handler that touches user owned data runs its work inside one transaction that first assumes the `app_user` role and sets `app.user_id` to the internal id, so the spec 0002 row level security policies resolve to that user.
- **AC-7**: `POST /api/webhooks/clerk` verifies the Svix signature with `CLERK_WEBHOOK_SIGNING_SECRET`; a missing or bad signature is rejected `400` and nothing is written. A verified `user.deleted` removes the `users` row and cascades all of that user's data per spec 0002 AC-7; any other event type returns `200` and is ignored. A redelivered `user.deleted` reaches the same end state.
- **AC-8**: A signed in user can open `/account` and manage their email, password, connected Google account, and passkeys (enroll and remove) through Clerk's profile UI, themed to the app's design tokens.
- **AC-9**: From a clearly separated danger zone on `/account`, a user can delete their account: the action requires typing the exact word `delete` (trimmed), calls Clerk's Backend API to delete the Clerk identity first, then removes all local data for that user; the `user.deleted` webhook is the backstop if the action stops between those two steps. Afterward the session is ended and the user lands on `/`.
- **AC-10**: A signed in user with no onboarding signal who lands on any `(app)` route is redirected to `/onboarding`; a user who has crossed feature 7's onboarding threshold is not. The signal is derived from existing data (a `taste_profile` row, or interaction count), with no new column.
- **AC-11**: The auth screens render on the app's design system, are fully keyboard operable with visible focus, and handle the pre-hydration state before Clerk is ready with no layout flash.

## Decision

**Chosen option**: Option 1: Themed Clerk prebuilt components, a privileged `resolve_user` function as the source of truth, webhook for delete reconciliation only.

Mount Clerk's `<SignIn/>`, `<SignUp/>`, and `<UserProfile/>` on app owned routes with the `appearance` API mapped to the design tokens from feature 5. Resolve the internal `users` row on the first authenticated request by calling a `SECURITY DEFINER` database function `resolve_user(clerk_user_id text)` from the ordinary pooled connection. Use the Clerk webhook only for `user.deleted` (cascade delete). Every authenticated database access goes through a shared `withUser` helper that opens a transaction, assumes the `app_user` role with `SET LOCAL ROLE`, and sets `app.user_id`.

**Implementation skills**: `clerk-setup` (`clerk/skills`, `.agents/skills/clerk-setup/`) · `clerk-nextjs-patterns` (`clerk/skills`, `.agents/skills/clerk-nextjs-patterns/`) · `clerk-custom-ui` (`clerk/skills`, `.agents/skills/clerk-custom-ui/`) · `clerk-webhooks` (`clerk/skills`, `.agents/skills/clerk-webhooks/`) · `clerk-backend-api` (`clerk/skills`, `.agents/skills/clerk-backend-api/`) · `drizzle-orm-patterns` (`giuseppe-trisciuoglio/developer-kit`, `.agents/skills/drizzle-orm-patterns/`) · `supabase` (`supabase/agent-skills`, `.agents/skills/supabase/`) · `supabase-postgres-best-practices` (`.agents/skills/supabase-postgres-best-practices/`) · `next-dev-loop` (`vercel/next.js`, `.agents/skills/next-dev-loop/`)

## Rationale

Reasoning, options considered, and prerequisites: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

No table changes. One small database function is added by a `--custom` migration.

- **users** (spec 0002, unchanged): `id` uuid pk `default gen_random_uuid()` · `clerk_user_id` text unique not null · `created_at`, `updated_at` timestamptz not null default `now()` · RLS enabled and forced, policy `users_self_access` scoping `id = nullif(current_setting('app.user_id', true), '')::uuid`.

- **`resolve_user(p_clerk_user_id text) returns uuid`** (new, `SECURITY DEFINER`, owned by the table owner, `set search_path = public`, `EXECUTE` granted to `app_user`): returns the internal id for a Clerk id, creating the row idempotently when absent. Read first, then upsert on miss, so a returning user's bootstrap does no write:

  ```sql
  create or replace function public.resolve_user(p_clerk_user_id text)
  returns uuid language plpgsql security definer set search_path = public as $$
  declare v_id uuid;
  begin
    select id into v_id from users where clerk_user_id = p_clerk_user_id;
    if v_id is not null then return v_id; end if;
    insert into users (clerk_user_id) values (p_clerk_user_id)
      on conflict (clerk_user_id) do update set updated_at = now()
      returning id into v_id;
    return v_id;
  end $$;
  ```

  It runs as its owner, so the forced RLS `with check` on `users` (which the bootstrap cannot satisfy, the internal id being the value it is resolving) does not block the insert. The only input is `p_clerk_user_id`, taken from the verified Clerk session (`auth().userId`). The app calls `select public.resolve_user($1)` on the normal pooled `DATABASE_URL` connection, outside any `withUser` transaction; it autocommits on its own.

- **Onboarding signal**: read, never stored. Feature 6 calls a `hasOnboarded(userId)` seam (run inside `withUser`); its provisional rule is "a `taste_profile` row exists for this user" (spec 0002). Feature 7 replaces the rule with its real threshold. No column.

- **Profile data** (email, name, avatar): lives only in Clerk. Never copied into the app database. Read at the edge with `useUser()` / `<UserButton/>` on the client or `currentUser()` on the server.

**State transitions**:

- **Session**: signed out → signed in (rolling, refreshes on activity) → expired or signed out. Clerk owns the timing; default rolling window is about 7 days.
- **Account**: none → active → deleted. Deletion is hard and irreversible (consistent with spec 0002's cascade); there is no soft delete and no grace period.
- **Onboarding gate**: new (no signal) → onboarded (signal present). Owned by feature 7; feature 6 only reads it.

**API surface**:

| Endpoint / helper | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/sign-in/[[...sign-in]]` | GET | themed `<SignIn/>` | rendered form | public | — |
| `/sign-up/[[...sign-up]]` | GET | themed `<SignUp/>` | rendered form | public | — |
| `/onboarding` | GET | placeholder page (feature 7 builds it) | rendered page | session | redirect to `/sign-in` |
| `/account` | GET | — | themed `<UserProfile/>` + danger zone | session | redirect to `/sign-in` |
| `deleteAccount` (Server Action) | POST | `confirmText: string` (req) | `Result<void, { kind: 'confirm_mismatch' \| 'provider_error' }>`; on ok, `redirect('/')` after the transaction | session | `confirm_mismatch`, `provider_error` |
| `POST /api/webhooks/clerk` | POST | Svix headers, JSON body | `200` / `400` | Svix signature | `400` bad or missing signature |
| `requireUserId()` (server helper) | — | Clerk session | internal `users.id` | session | redirects to `/sign-in` when no session |
| `withUser(userId, fn)` (server helper) | — | `userId`, `(tx) => …` callback | `fn` result | — (caller is gated) | throws on a non uuid `userId` |
| `hasOnboarded(userId)` (server helper) | — | `userId` | boolean | — (called inside `withUser`) | — |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Resolve internal user id | `users.id` | `select public.resolve_user($1)` with `$1` = `auth().userId` from the verified Clerk session, on the pooled connection; memoized per request with `React.cache()` in `requireUserId()` |
| Assume the restricted role | current role = `app_user` | `SET LOCAL ROLE app_user` as the first statement of the `withUser` transaction (the connection role is a member of `app_user`, see Configuration required) |
| Set RLS context | `app.user_id` | the resolved internal `users.id`, validated as a uuid, set with `select set_config('app.user_id', $1, true)` right after `SET LOCAL ROLE` |
| Route protection decision | is this path public? | the literal `config.matcher` and public checks in `src/middleware.ts` (enumerated in Configuration required); route group names never appear in a matcher |
| Unauthenticated redirect target | `/sign-in` | `<ClerkProvider signInUrl="/sign-in">` |
| Post sign up redirect | `/onboarding` | Clerk `<SignUp/>` `forceRedirectUrl="/onboarding"`; every later visit goes through the `(app)` layout gate |
| Post sign in redirect (returning user) | `/feed` | `<ClerkProvider signInFallbackRedirectUrl="/feed">`; the `(app)` gate then bounces a not onboarded user to `/onboarding` |
| Sign out landing | `/` | `<ClerkProvider afterSignOutUrl="/">` (and the `<UserButton/>` inherits it) |
| Onboarding gate decision | has this user onboarded? | derived by `hasOnboarded(userId)` inside `withUser`: provisional rule is existence of a `taste_profile` row (spec 0002); feature 7 owns the final rule |
| Webhook authenticity | is the signature valid? | `verifyWebhook()` (from `@clerk/nextjs/webhooks`) with `CLERK_WEBHOOK_SIGNING_SECRET` against the Svix headers |
| Which webhook events act | event type | `user.deleted` → delete the row and cascade, run over the `app_inngest` bypass connection; any other → ignore with `200` |
| Delete account confirmation | does the confirm text match? | the Server Action compares `confirmText.trim()` to the exact literal `"delete"` before proceeding |
| Delete the Clerk identity | Clerk user id | `auth().userId` of the current session, passed to `clerkClient().users.deleteUser()` first, before any local delete |
| Session lifetime | rolling window (~7 days) | Clerk instance default, a dashboard setting, no code |
| Signed in name / email / avatar in the UI | Clerk user object | `useUser()` / `<UserButton/>` (client) or `currentUser()` (server); never stored locally |

**Key invariants**:
- Exactly one `users` row per `clerk_user_id` (unique constraint plus the `on conflict do update` inside `resolve_user`).
- The internal `users.id` never changes for a given `clerk_user_id`, and is the only id any foreign key references (spec 0001, spec 0002).
- No authenticated read or write of user owned data happens outside a `withUser` transaction; inside it, `current_user` is always `app_user` (assert this in tests). The Server Action or Route Handler check is the primary gate; RLS is the backstop (spec 0001).
- `withUser` is not reentrant: one call per unit of work, and `fn` receives the transaction handle so callers compose inside the one transaction rather than nesting.
- `resolve_user` is the only code path that inserts into `users`; it is the single privileged surface, one function with one `text` argument.
- `/api/webhooks/clerk` writes nothing unless the Svix signature verifies; the payload is treated as untrusted and Zod narrowed after verification.
- Account deletion calls Clerk before it deletes local rows, so every interrupted state converges on "deleted", never on "silently reset".
- Account deletion is irreversible: no soft delete, no grace period.
- The `(marketing)` group is excluded from `config.matcher` outright, so `clerkMiddleware` never runs over it (spec 0001).
- `user.deleted` handling is idempotent: a redelivery reaches the same end state and returns `200`.

**Security model**:
- **Primary gate**: `clerkMiddleware` protects everything the matcher covers; each authenticated handler still calls `auth()` / `requireUserId()` and scopes its queries.
- **Backstop**: the Postgres row level security from spec 0002, reached only when `withUser` has assumed `app_user` and set `app.user_id`.
- **Privileged surface**: exactly one `SECURITY DEFINER` function, `resolve_user`, taking one `text` argument (the verified Clerk id). No owner role connection sits on the request path. The webhook's `user.deleted` cascade runs over the existing `app_inngest` bypass connection (`DATABASE_URL_UNPOOLED`), since it has no session and therefore no `app.user_id`.
- **`withUser` fails safe both ways, so tests must catch both**: a wrong role would run queries as owner with RLS inert (a leak); a wrong or missing `app.user_id` returns zero rows (looks like a bug). `withUser` validates `userId` as a uuid before `set_config` (a non uuid would raise inside the policy cast, not fail closed), and the verify suite asserts `current_user = 'app_user'` and cross user isolation.
- **Webhook**: public endpoint, authenticated by Svix signature. Reject first, parse second.
- **PII**: email, name, and avatar live only in Clerk and are never copied to the app database, so a local breach exposes no contact data. Account deletion must still call Clerk to erase the identity there.
- **Roles**: none in this feature. Every account is an ordinary user; admin and staff access are deferred (scope "Admin panel"). See Follow-up.
- **Abuse controls**: Clerk bot sign up protection and breached password detection stay enabled (Clerk defaults, dashboard config). Clerk owns rate limiting on the auth endpoints. The `deleteAccount` action is session gated and low volume, so it needs no extra limiter.
- **Known accepted gap**: `auth()` verifies the session JWT locally with no network call, so for up to one token refresh cycle (about 60 seconds) after a `user.deleted`, a still valid cookie will pass `requireUserId()` and `resolve_user` will recreate a `users` row for the deleted identity. Closing this fully needs a tombstone table (a schema change out of scope here). Documented in Consequences with a verify observation.

**Configuration required**:
- No new environment variables. `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and `CLERK_WEBHOOK_SIGNING_SECRET` are already declared in `src/env.ts` and spec 0001.
- **Dependency**: add `@clerk/nextjs` at a version compatible with Next.js 16 and React 19.
- **`--custom` migration**: create `public.resolve_user(text)` as above, `grant execute on function public.resolve_user(text) to app_user`, declared in `schema.ts` where drizzle-kit can round trip it (or as a checked in custom migration if it cannot). This is the only schema object this feature adds.
- **Pooled connection role**: the role `DATABASE_URL` authenticates as must be a member of `app_user` so `SET LOCAL ROLE app_user` succeeds (migration `0002_grant_migrator_app_user_membership.sql` did this for the migrator role; confirm it holds for the request role on the hosted database and add the grant if not).
- **`<ClerkProvider>` props** (all keep "no new env vars" true): `signInUrl="/sign-in"`, `signUpUrl="/sign-up"`, `signInFallbackRedirectUrl="/feed"`, `afterSignOutUrl="/"`. On `<SignUp/>`: `forceRedirectUrl="/onboarding"`.
- **`src/lib/result.ts`**: promote the `Result<T, E>` shape currently local to `src/lib/tmdb/result.ts` into a shared module so `deleteAccount` (and later features) use the one documented pattern AGENTS.md calls for.
- **Clerk dashboard, per instance (development and production)**: enable email plus password, emailed one time code, and Google OAuth (needs a Google Cloud OAuth client); enable passkeys as a second factor / post sign up credential; require email verification before app access; keep the rolling session default.
- **Clerk webhook**: register the `/api/webhooks/clerk` endpoint subscribed to `user.deleted` only; copy its signing secret into `CLERK_WEBHOOK_SIGNING_SECRET`. Use the `clerk` CLI to forward webhooks to localhost during the build.

**Critical test scenarios** (each maps to an acceptance criterion in `## Requirements`):
- Happy path: a new visitor signs up with an emailed code, verifies, and lands on `/onboarding`; a `users` row exists with a stable id; sign out returns to `/`; signing back in (now onboarded) reaches `/feed`. Verifies **AC-1**, **AC-2**, **AC-5**, **AC-10**.
- Session persistence: after a full browser restart the user is still signed in and is not asked to re-authenticate. Verifies **AC-3**.
- Route protection: an anonymous request to `/feed` redirects to `/sign-in`; anonymous `GET /api/health`, `GET /api/inngest`, and `POST /api/webhooks/clerk` still respond; anonymous `/`, `/onboarding`, `/account`, `/styleguide` render; a signed in request to `/feed` renders. Verifies **AC-4**.
- Concurrency: two simultaneous first requests for the same new Clerk user create exactly one `users` row and neither errors. Verifies **AC-5**.
- RLS context: a Server Action reading `user_movie_interactions` inside `withUser(otherUserId, …)` returns none of the current user's rows; `current_user` inside the transaction is `app_user`; a query run with no `app.user_id` set returns nothing (RLS closed). Verifies **AC-6**.
- Webhook signature: a `POST /api/webhooks/clerk` with a tampered body is rejected `400` and writes nothing; a valid `user.deleted` removes the row and cascades (interactions, taste profile, watchlist gone); redelivering the same event still returns `200`; an unhandled event type returns `200` and writes nothing. Verifies **AC-7**.
- Delete account: a wrong confirm word returns `confirm_mismatch` and the account still exists; the exact word deletes the Clerk identity first (checked in the Clerk dashboard), then every local row, ends the session, and lands on `/`; a Clerk API failure returns `provider_error` and leaves both sides intact; the follow up `user.deleted` webhook is a no op. Verifies **AC-9**.
- Stale cookie observation (not an AC): delete a user via webhook, then within 60 seconds request `/feed` with the still valid cookie; record that a row is recreated and gone again after the next token refresh, confirming the documented window.
- Accessibility: the sign in form is fully keyboard operable with visible focus and shows no flash before Clerk hydrates. Verifies **AC-11**.

## Build plan

Tracer Bullet: stand up a thin signed in thread through middleware, UI, session, and the database first (steps 1 to 5), then thicken with delete reconciliation and account management (steps 6 to 7).

1. Add `public.resolve_user(text)` and its `execute` grant as a `--custom` migration; promote `Result<T, E>` into `src/lib/result.ts`. Confirm the request connection role is a member of `app_user`. Satisfies **AC-5**, **AC-6** (groundwork).
2. Add `@clerk/nextjs`, wrap the root layout in `<ClerkProvider>` with `signInUrl`, `signUpUrl`, `signInFallbackRedirectUrl="/feed"`, `afterSignOutUrl="/"`, and add `src/middleware.ts` with `clerkMiddleware` protected by default and a literal `config.matcher` that excludes `/`, the rest of `(marketing)`, `/sign-in`, `/sign-up`, `/onboarding`, `/account`, `/styleguide`, `/api/health`, `/api/webhooks/(.*)`, `/api/inngest`, and `_next` / static assets. Thin thread: an anonymous hit on `/feed` redirects to `/sign-in`, a signed in hit renders. Satisfies **AC-4**.
3. Add `/sign-in/[[...sign-in]]` and `/sign-up/[[...sign-up]]` mounting themed `<SignIn/>` / `<SignUp/>` (`<SignUp forceRedirectUrl="/onboarding">`), Clerk `appearance` mapped to the design tokens, with a pre-hydration placeholder. Enable email plus password, email code, Google OAuth, and passkeys in the Clerk dashboard; require email verification. Satisfies **AC-1**, **AC-2**, **AC-11**.
4. Build `src/lib/auth/`: `resolveInternalUserId(clerkUserId)` (calls `select public.resolve_user($1)`, wrapped in `React.cache()`), `requireUserId()` (reads `auth()`, redirects when absent, else resolves), and `withUser(userId, fn)` (validates the uuid, opens a transaction, `SET LOCAL ROLE app_user`, `set_config('app.user_id', …, true)`, then `fn(tx)`; non reentrant). Satisfies **AC-5**, **AC-6**.
5. Add the `(onboarding)` route group with a placeholder `/onboarding` page (feature 7 builds it out), and wire the `(app)` layout: `requireUserId()` on entry, then `withUser(userId, (tx) => hasOnboarded(tx, userId))`, redirecting a not onboarded user to `/onboarding`. Add `<UserButton/>` to the app shell header. Satisfies **AC-2**, **AC-10**.
6. Implement `POST /api/webhooks/clerk`: `verifyWebhook()` with the signing secret, Zod narrow the payload, handle `user.deleted` (delete the `users` row and cascade per spec 0002, over the `app_inngest` bypass connection), ignore other events with `200`, reject a bad signature `400`, idempotent throughout. Register the Clerk webhook subscription for `user.deleted`. Satisfies **AC-7**.
7. Build `/account`: a themed `<UserProfile/>` route plus a separated danger zone with a type to confirm `deleteAccount` Server Action that compares `confirmText.trim()` to `"delete"` (`confirm_mismatch` on miss), calls `clerkClient().users.deleteUser()` first (`provider_error` on failure), then deletes the local rows inside `withUser`, and calls `redirect('/')` after the transaction returns. Satisfies **AC-8**, **AC-9**.
8. Verify: run `/check verify` against the scenarios above, smoke the RLS context and `current_user` assertions as `app_user`, record the stale cookie window, and confirm the `(marketing)` group is still static and outside `config.matcher`. Satisfies **AC-3**, **AC-4**, **AC-6**.

## Consequences

**Positive**:
- Every later slice gets `requireUserId()` and `withUser()` as the standard signed in entry, plus a stable internal id that does not depend on webhook timing.
- The whole request path stays on one pooled connection: no second connection or pool on the hot path, no pressure on Supabase's direct connection ceiling.
- The privileged surface is one small function with one `text` argument, easy to review, instead of an owner role connection reachable from request code.
- No PII in the app database: a local data breach exposes no email or name.
- Themed Clerk components give accessible, maintained auth UI at low build cost, close to the feature 5 design system.
- Clerk first deletion ordering means every interrupted delete converges on "deleted", never on a silent reset.

**Negative / tradeoffs**:
- A `SECURITY DEFINER` function is privileged code: it must pin `search_path` and take only the one argument, and any future change to it is a security review point. This is the cost of getting past the RLS bootstrap without a second connection.
- "No schema migration" is now "one tiny function migration"; the feature is no longer purely additive at the app layer.
- Themed Clerk components are not pixel perfect to the design system; a strong visual divergence later would force the fully custom hook path.
- Passkeys cannot be a first factor at sign up with Clerk's prebuilt `<SignUp/>`; they are enrolled after an account exists and then usable to sign in. AC-1 is three methods, not four, by this constraint.
- Hard account deletion is irreversible with no grace period (inherited from spec 0002); a mis confirmed delete cannot be recovered. The type to confirm step is the only guard.
- For up to about 60 seconds after a `user.deleted`, a still valid session cookie recreates a `users` row for the deleted identity, because `auth()` verifies the JWT locally. Accepted; closing it needs a tombstone table.
- Clerk is now firmly on the critical path: an outage blocks all sign in and the whole `(app)` group. The static marketing site staying up is the only mitigation.
- Session lifetime and the four `<ClerkProvider>` redirect URLs plus the sign in method toggles live in the Clerk dashboard and provider props, not in one obvious config file; they can drift from what this spec assumes without a code review catching it.

**Neutral**:
- No table migration; `users` and its RLS policy already exist from spec 0002. The only new object is the `resolve_user` function.
- `hasOnboarded(userId)` is a seam feature 7 completes; feature 6 ships the provisional `taste_profile` existence check and the placeholder `/onboarding` page.
- The `usage_counters` over limit error shape (spec 0002 Follow-up) is untouched here; still owned by the first AI calling feature. This feature does promote `Result` into `src/lib/result.ts`, which that decision can build on.
- Admin and staff roles stay out of scope; every account is an ordinary user.

## Follow-up

- [ ] Feature 7 owns the real `hasOnboarded(userId)` rule (interaction threshold vs `taste_profile` existence) and builds out `/onboarding`; feature 6 ships a provisional check and a placeholder page.
- [ ] Consider a tombstone table (or a short lived deny list) if the roughly 60 second post deletion window where a stale cookie recreates a row proves to matter in practice.
- [ ] Admin and staff role model is deferred (scope "Admin panel"); when it lands it must extend the middleware gate and probably add a `role` column to `users`.
- [ ] Set per vendor spend alerts before opening sign ups (carried from spec 0001), including Clerk monthly active user billing.
- [ ] Verify the Clerk development instance keys and local webhook forwarding (`clerk` CLI) are set up before build begins (see the `clerk-webhooks` and `clerk-backend-api` skills).
- [ ] Cookie consent, privacy policy, and terms (scope "Deferred") become relevant once real accounts are live; track it, not blocking.
