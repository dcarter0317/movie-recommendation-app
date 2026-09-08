# 0006. Accounts and sign in: rationale

Decision record for [index.md](index.md). `/develop` does not need this file.

## Context

Slice 1 is the walking skeleton: a user signs in, teaches the app a little taste by swiping, and sees a personalized feed. Nothing in that thread works without accounts. Feature 6 is the first slice feature, and three earlier specs already left holes shaped exactly for it:

- **Spec 0001** fixed Clerk as the hosted identity and session service, fixed that Supabase Auth is not used, and described (but did not build) the Clerk to `users` webhook sync, the session handling, and the `withUser` helper that opens the request transaction and sets `app.user_id`. It also fixed that authorization is enforced primarily in Server Actions and Route Handlers, with row level security as a backstop, and that the `(marketing)` route group must stay static and out of the auth middleware.
- **Spec 0002** built the `users` table (`id` uuid, `clerk_user_id` text unique) and turned on forced row level security across every user owned table, with policies that read `current_setting('app.user_id')`. It explicitly assigned to feature 6: the lazy upsert into `users` on the first authenticated request, setting `app.user_id` in the request transaction as the `app_user` role, and the in app account deletion action that AC-7's cascade depends on (which must also call Clerk's Backend API, not only delete local rows). `schema.ts` also explicitly leaves to feature 6 the choice of *how* the request path's connection assumes the `app_user` role (a dedicated login role, or `SET ROLE` from an already authenticated connection).
- **Spec 0005** shipped the design system, including keyboard and focus handling, so the auth screens have real tokens to render against.

The forces at play:

- **The provider is already chosen.** This is not a build versus buy decision. The open questions are the integration shape: how the auth UI is built, how the internal `users` row is created and kept in sync, and how the request transaction sets the RLS context.
- **Webhook timing cannot be load bearing.** Clerk bills per monthly active user and holds the identity record; a missed or delayed `user.created` webhook must not mean a user with no `users` row. Spec 0001 already resolved this in principle (lazy upsert is the source of truth); feature 6 has to implement it.
- **Row level security only works if the request connects as a non owner role with `app.user_id` set.** Spec 0002 was firm on this: the table owner is exempt from its own forced policies unless the connection is the dedicated `app_user` role. But the very first `users` upsert is a bootstrap problem: at that moment the internal id does not exist yet, so an insert as `app_user` fails the forced `with check` on `users`.
- **The request path must stay on the pooled connection.** Spec 0001 fixed Supavisor transaction pooling for the request path and reserved the direct connection (`DATABASE_URL_UNPOOLED`) for migrations and Inngest steps, because a serverless function opening direct Postgres connections runs into Supabase's low direct connection ceiling. Any bootstrap fix that reaches for the direct connection on the hot path reintroduces exactly that failure mode.
- **The design system exists.** A prebuilt widget that cannot be themed would clash with feature 5. Clerk's `appearance` API is the middle path; fully custom forms are the fallback if it is not close enough.
- **Consequence of not deciding**: every Slice 1 feature stalls. Feature 7 (swipe onboarding and feed) cannot record an interaction without a user id and the `withUser` transaction pattern.

## Options considered

### Option 1: Themed Clerk prebuilt components, a privileged `resolve_user` function as the source of truth, webhook for delete reconciliation only

Mount `<SignIn/>`, `<SignUp/>`, and `<UserProfile/>` on app owned routes, styled with Clerk's `appearance` API against the design tokens. Resolve the internal `users` row on the first authenticated request by calling a `SECURITY DEFINER` database function `resolve_user(clerk_user_id text)` (read first, upsert on miss) from the ordinary pooled connection; the function runs as its owner so it clears the RLS bootstrap without a second connection. Use the webhook only for `user.deleted` (cascade). Every authenticated database access goes through a shared `withUser` helper that assumes `app_user` with `SET LOCAL ROLE` and sets `app.user_id`.

**Pros**:
- Keeps spec 0001's intent (a stable id on the first request, webhook as reconciliation) while staying entirely on the pooled connection.
- The privileged surface is one small reviewable function with one `text` argument, not an owner role connection reachable from request code.
- Prebuilt components are accessible and maintained; low build cost, and the `appearance` API gets them close to the design system.
- The webhook surface is one event type, so there is no cross event ordering race to reason about.

**Cons**:
- Adds one `SECURITY DEFINER` function, which is privileged code (must pin `search_path`, one argument only); "no schema migration" becomes "one function migration".
- `appearance` theming is not pixel perfect; deep divergence from the design system would not be fixable without switching to custom forms.
- Passkeys cannot be a first factor at sign up with prebuilt `<SignUp/>`; they are enrolled afterward.

### Option 2: Clerk Account Portal redirect, webhook as the primary user sync

Send users to Clerk hosted sign in and sign up pages, redirect back after. Rely on the `user.created` webhook to create the `users` row.

**Pros**:
- Least code: no auth routes to build or theme.
- Clerk fully owns the auth UI and its edge cases.

**Cons**:
- Users leave the app's domain to sign in; branding and layout control are lost, which is a poor first impression for a consumer product.
- Making the webhook the primary create path reintroduces exactly the orphaned or missing row risk spec 0001 called out; a delayed webhook means a signed in user with no `users` row and a broken first request.
- Still needs the `withUser` transaction work anyway, so it saves less than it looks.

### Option 3: Fully custom auth UI with Clerk hooks, lazy upsert as the source of truth

Build the sign in and sign up forms with `useSignIn` / `useSignUp` (the `clerk-custom-ui` skill), same user sync approach as Option 1.

**Pros**:
- Pixel exact match to the design system.
- Full control over copy, layout, and flow.

**Cons**:
- Significantly more code and many more edge cases to own: multi factor, passkey enrollment, OAuth callback handling, verification code entry, error states, all hand built.
- More surface to keep working as Clerk evolves.
- Disproportionate for Slice 1, whose point is a thin thread, not a polished auth experience.

## Rationale

Option 1 is chosen because it is the one that matches the decisions already made and keeps the thin thread thin. Spec 0001 already described this shape (a stable id resolved on the first request, webhook as reconciliation, `withUser` for the transaction); Option 2 would contradict it by making webhook delivery load bearing, and spec 0001 explicitly listed "a missed webhook means an orphaned or missing `users` row" as a risk to avoid, not accept. Option 3's pixel accuracy is not worth its cost at this stage: Slice 1 is a walking skeleton, and the `clerk-custom-ui` path stays available later if the themed components prove too far from the design system in practice.

**The RLS bootstrap, and why a function not a second connection.** Spec 0002 was deliberate that the request path connects as `app_user` so forced row level security actually applies, but the first `users` resolve cannot satisfy that: the internal id does not exist yet, so the forced `with check` on `users` rejects an insert made as `app_user`. The first draft of this spec resolved it by running that one statement over the direct unpooled connection. The cross check flagged this correctly: the direct connection is reserved by spec 0001 for migrations and Inngest steps precisely because putting it on the serverless request path runs into Supabase's direct connection ceiling. A `SECURITY DEFINER` function, `resolve_user(clerk_user_id text)`, owned by the table owner with `EXECUTE` granted to `app_user`, clears the bootstrap while the whole request stays on the pooled connection: no second connection, no second pool, and the privileged surface shrinks from a whole owner role connection to one function with one `text` argument. It costs one `--custom` migration, which is a better trade than either the connection pressure or reopening spec 0002's policy design.

**How `withUser` assumes the role.** `schema.ts` left this open. `SET LOCAL ROLE app_user` as the first statement of the `withUser` transaction, over the existing pooled connection, is the answer that adds no environment variable: migration `0002_grant_migrator_app_user_membership.sql` already granted the membership pattern, and the request connection role just needs the same grant. A dedicated login role would work too but forces a new `DATABASE_URL_APP` secret for no real gain.

**Webhook: `user.deleted` only.** The interview picked `user.created` plus `user.deleted`. With `resolve_user` as the unambiguous source of truth, `user.created` buys nothing and costs an out of order delivery race: Svix does not guarantee ordering, so a delayed or redelivered `user.created` arriving after a `user.deleted` would re-insert a row for a deleted identity. Per event idempotency does not fix a cross event race. Subscribing to `user.deleted` alone removes the race without needing a dedupe table (which would be a schema change this feature has ruled out).

**Deletion ordering: Clerk first.** AC-9 calls Clerk's Backend API to delete the identity *before* touching local rows. Local first, then a Clerk failure, would leave a live Clerk identity whose next request recreates an empty `users` row through `resolve_user`: a silent reset, not a deletion. Clerk first means every interrupted state converges on "deleted", with the `user.deleted` webhook as the backstop for the local cascade.

Sign in methods: the engineer asked for all four Clerk supports. Three of them (email plus password, emailed code, Google OAuth) are sign up methods and become AC-1. Passkeys are the fourth, but Clerk's prebuilt `<SignUp/>` cannot create an account with a passkey as the first factor; a passkey is enrolled after an account exists and is then usable to sign in. So passkey enrollment lands in AC-8 (profile management) and passkey sign in in AC-2, and the practical coverage the engineer wanted is unchanged. Google OAuth is the expected primary path for this audience; email plus password and emailed code cover users without a Google account.

Account deletion is included in this feature rather than deferred because spec 0002's AC-7 (delete cascades) stays unverified end to end until something drives it from the app, the webhook infrastructure it needs is already being built here for `user.deleted`, and the surface is small (one Server Action plus a danger zone on a page that already exists for `<UserProfile/>`).

## Prerequisites

Both load bearing prerequisites exist, so nothing blocks this design:

- Clerk as the identity and session provider: spec 0001, Accepted.
- The `users` table and the forced RLS model with the `app_user` role and `app.user_id` GUC: spec 0002, Accepted.

This feature assumes feature 7 will provide the real onboarding signal and build out `/onboarding`. Feature 6 ships a provisional `taste_profile` existence check and a placeholder `/onboarding` page in an `(onboarding)` route group that sits outside the `(app)` gate (so the gate cannot redirect the onboarding page to itself), making the gate (AC-10) testable now; feature 7 replaces both. This is tracked in Follow-up, not left implicit.
