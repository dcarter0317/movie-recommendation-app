# 0006. Accounts and sign in: verify steps

Manual and driven checks for `/check verify`. Each maps to an acceptance criterion in [index.md](index.md). Run against the local stack (`supabase start`, `inngest dev`, `clerk` CLI webhook forwarding, Clerk development instance keys).

## AC-1: sign up with the three sign up methods, email verification enforced

1. Visit `/sign-up` signed out. Confirm the form offers email plus password, emailed code, and Google (passkey is not a sign up option, by Clerk's prebuilt `<SignUp/>` constraint).
2. Sign up with an emailed code. Confirm the app does not reach any `(app)` route until the code is entered.
3. Sign up with Google in a second browser profile. Confirm it lands signed in with no separate verification step.

## AC-2: sign in (incl. passkey), sign out, landing

1. Sign in with a registered email method. Confirm it reaches `/feed` (or `/onboarding` if not onboarded).
2. Enroll a passkey on `/account`, sign out, then sign in with the passkey. Confirm it works.
3. Use the `<UserButton/>` sign out. Confirm the browser lands on `/` and a later `/feed` visit redirects to `/sign-in`.

## AC-3: session persists across restart

1. Sign in. Fully quit and reopen the browser.
2. Visit `/feed`. Confirm it renders with no credential prompt.

## AC-4: route protection (literal matcher)

1. Signed out, request `/feed`. Confirm it redirects to `/sign-in`.
2. Signed out, request `GET /api/health`, `GET /api/inngest`, `POST /api/webhooks/clerk`. Confirm none redirect (they respond on their own terms); `/api/health` in particular must still return its health payload.
3. Signed out, request `/`, `/onboarding`, `/account`, `/styleguide`, `/sign-in`. Confirm each renders (the page routes; `/account` and `/onboarding` render their signed out state or their own redirect, not the middleware's).
4. Signed in, request `/feed`. Confirm it renders.
5. Confirm `src/middleware.ts` `config.matcher` is literal path patterns, with no route group name (`(marketing)`, `(app)`) in it, and that `/` is excluded from the matcher entirely.

## AC-5: resolve_user, concurrent first request

1. Delete any local `users` row for the test Clerk user. Fire two `/feed` requests at once for that user (two parallel `curl` with the session cookie).
2. Confirm exactly one `users` row exists afterward and neither request errored.
3. Sign in again as an existing user and confirm `resolve_user` does no `update` (check `updated_at` is unchanged, i.e. the read first path was taken).

## AC-6: RLS context

1. In a scratch script, call a query that reads `user_movie_interactions` inside `withUser(userIdA, (tx) => …)` while seeded rows exist for `userIdB`. Confirm zero rows from B come back.
2. Inside the same transaction, assert `select current_user` returns `app_user`.
3. Run the same read with no `app.user_id` set as `app_user`. Confirm it returns nothing (RLS closed), not an error that leaks.
4. Pass a non uuid `userId` to `withUser`. Confirm it throws before `set_config`, not deep in a policy cast.

## AC-7: webhook signature and events (user.deleted only)

1. `POST /api/webhooks/clerk` with a body but a tampered signature. Confirm `400` and no DB write.
2. Send a valid `user.deleted` for an existing user with seeded interactions, watchlist, taste profile. Confirm the `users` row and all cascaded rows are gone; resend the same event and confirm `200` with no error.
3. Send a valid `user.created` or `session.created` (an unhandled type). Confirm `200` and no write.
4. Confirm the Clerk dashboard webhook subscription lists `user.deleted` only.

## AC-8: profile management

1. Signed in, open `/account`. Confirm Clerk's `<UserProfile/>` renders themed to the app tokens and lets you add and remove a passkey, change password, and view the connected Google account.

## AC-9: delete account (Clerk first, Result value)

1. On `/account`, in the danger zone, submit the delete form with the wrong confirm word. Confirm the action returns `{ ok: false, error: { kind: 'confirm_mismatch' } }` and the account still exists.
2. Simulate a Clerk Backend API failure. Confirm the action returns `{ ok: false, error: { kind: 'provider_error' } }` and both the Clerk identity and the local rows are still intact (nothing was deleted).
3. Submit with `delete` (exact, trimmed). Confirm: the Clerk identity is deleted first (check the Clerk dashboard), then all local rows for the user, the session is ended, and the browser lands on `/`. Confirm `redirect('/')` runs after the `withUser` transaction returns, not inside it.
4. Confirm the `user.deleted` webhook Clerk then sends is a no op (`200`, nothing left to delete).

## AC-10: onboarding gate

1. As a signed in user with no `taste_profile` row, visit `/feed`. Confirm redirect to `/onboarding`.
2. Confirm `/onboarding` itself does not redirect (it is outside the `(app)` gate group).
3. Insert a `taste_profile` row for the user. Visit `/feed` again. Confirm it renders without redirect.

## AC-11: accessibility

1. On `/sign-in`, tab through every control. Confirm visible focus on each and no keyboard trap.
2. Throttle the network and reload. Confirm no layout flash or jump before Clerk hydrates.

## Observation (not an AC): stale cookie window

1. Delete a user via a `user.deleted` webhook, then within about 60 seconds request `/feed` with the still valid session cookie.
2. Record the behavior: a `users` row is recreated by `resolve_user` and is gone again after the next token refresh. Confirm this matches the documented accepted window in Consequences; it is not a pass/fail gate.

## Regression guard

- Confirm the `(marketing)` group still builds statically and its routes are absent from `src/middleware.ts` `config.matcher`.
- Confirm `public.resolve_user(text)` exists, is `SECURITY DEFINER`, has `search_path` pinned, and `EXECUTE` is granted to `app_user` and not to `public`.
- Confirm `pnpm typecheck` and `pnpm lint` pass.
