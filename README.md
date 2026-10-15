# PadelLiel - Padel Community Management

Mobile-first, Hebrew / RTL web app for the coaching team and its padel trainees (Kochav Yair). It replaces WhatsApp polls and spreadsheets:
the coach publishes weekly sessions, trainees book and cancel themselves, and the rules (monthly session quota, 8-hour cancellation policy,
capacity, levels, waiting list) are enforced in the database.

**Stack:** Next.js 16 (App Router, TypeScript, React 19, Tailwind 4) · Supabase (PostgreSQL, Auth, RLS) · Vercel.
**Out of scope on purpose:** payments, invoices, checkout, wallets/credits, WhatsApp API automation. The WhatsApp feature only produces a Hebrew
message with the booking link to copy/share.

## Verification status (please read)

| Area | Status |
|---|---|
| SQL business rules, RLS, privileges, concurrency | **Verified** - 164 tests against a real PostgreSQL 18 (`npm run test:db`), including the community-events RLS and storage policies |
| Pure TypeScript (time, validation, error mapping, generators) | **Verified** - 56 unit tests |
| Type check, lint, production build | **Verified** (`npm run typecheck`, `npm run lint`, `npm run build`) |
| App boots without env and redirects to `/setup`; `/setup` renders RTL Hebrew | **Verified** (smoke test against `next start`) |
| Against a **live Supabase project**: Auth e-mail flows, PostgREST RPC argument shapes, `.select()` behaviour, RLS through PostgREST | **NOT verified** - no Supabase credentials were available while building. Follow the first-run checklist below. |
| In-browser UI behaviour (modals, dialogs, RTL layout on devices) | **NOT verified** - no browser automation was run |

The annual-events import (`/admin/events/import`) and the date-only draft migration are verified against the embedded PostgreSQL only (RLS, grants, constraints, idempotency, preserved edits). They have **NOT** been run against a live Supabase project: the migration has not been applied there, and PostgREST behaviour for the new columns (including the "column does not exist" detection before the migration) is unverified.

Community-event image upload (Supabase Storage API, `next/image` with the Supabase host, browser-side image downscaling) is likewise **NOT verified** against a live project or a browser; the storage RLS policies are tested against a stub of the `storage` schema.

"The DB tests use a stub of Supabase's `auth` and `storage` schemas (`auth.users`, `auth.uid()`, `storage.buckets/objects`), not Supabase itself.

## Local setup

Requirements: Node.js 22+, npm, a Supabase project (free tier is fine).

```bash
npm install
cp .env.example .env.local      # then fill in the values (see below)
npm run dev                     # http://localhost:3000
```

Without `.env.local` the app redirects every page to `/setup`, which explains what is missing.

### Environment variables

| Variable | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | public |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | same page (publishable / anon key) | public. `NEXT_PUBLIC_SUPABASE_ANON_KEY` is accepted as a fallback name |
| `NEXT_PUBLIC_APP_URL` | your deployed URL (`http://localhost:3000` locally) | used in auth e-mail links and the WhatsApp message |

| `ALLOW_EVENT_IMPORT` | server only (optional) | set to `1` to let `/admin/events/import` write the annual events. Leave unset otherwise; the dry-run works without it. Never a `NEXT_PUBLIC_` variable |

The Supabase `service_role` key is **never** used or needed. Do not commit `.env.local`.

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. Apply the SQL migrations **in order** (core schema → booking engine → RLS and grants → seed defaults → admin member list → monthly quota → single court → community events → date-only event drafts → subscription future-start fix → phone sign-up profile trigger) using the SQL Editor. **`20261015000015_phone_signup_profile.sql`** replaces `handle_new_user()` so a phone-only sign-up (no e-mail) gets a correct pending profile; it changes no data. **Apply it before turning phone sign-up on.** **`20261015000013_subscription_future_start.sql`** fixes a plan scheduled for a future date blocking the member's bookings until it starts (it adds `member_subscriptions.superseded` and replaces four functions; no booking or allowance data changes). **Review `20261014000012_community_events_date_only_drafts.sql` before applying it to a live project** (it makes `community_events.starts_at` nullable, adds `date_start`, `date_end`, `import_key` and the `effective_starts_at` column, and rebuilds `effective_ends_at`; it changes no existing row's data). **Apply it before deploying the app version that uses it**; the previous app version keeps working after it.
   The migration files are not part of this repository and are kept locally. The seed adds the three skill levels, three starter plans (once / twice / three times a week = 4 / 8 / 13 sessions per month) and default settings (8h cutoff, capacity 4, 07:00-08:00 and 08:00-09:00).
3. **Authentication → URL Configuration**
   - Site URL: your app URL (e.g. `https://padel-liel.vercel.app`).
   - Redirect URLs: add `https://<your-app>/auth/callback` and `http://localhost:3000/auth/callback`.
4. **Authentication → Sign In / Providers → Phone** (trainees sign up with a phone number and a password, no e-mail and no SMS code):
   - Turn **Enable Phone provider** ON.
   - Turn **Enable phone confirmations** OFF. This is what makes sign-up instant: no SMS is sent, so no SMS provider is needed. While it is ON, registration shows "ההרשמה אינה זמינה כרגע" and the server log names this setting. (`GET <project-url>/auth/v1/settings` reports it as `external.phone` and `phone_autoconfirm`; both must be `true`.)
   - If the dashboard will not save the Phone form without an SMS provider, choose one and enter placeholder credentials. This was not verified: none is ever called while confirmations are off.
   - **Authentication → Sign In / Providers → Email → Password requirements**: set the minimum length (and, on Pro, leaked-password protection). The app asks for at least 8 characters and shows Supabase's "weak password" answer in Hebrew.
   - **Authentication → Attack Protection**: sign-up is open to anyone with the link, so keep the default rate limits and consider enabling CAPTCHA (Turnstile).
5. Register the admin account through the app's `/register` page (name, phone, password: exactly like a trainee), then promote it in the SQL Editor:

```sql
update public.profiles
set role = 'admin', approval_status = 'approved'
where phone = '+972501234567';   -- the coach's number in E.164: +972, then the number without its leading 0
```

Everyone, the coach included, signs in with a phone number and password. Accounts created before phone sign-up (e-mail based) can no longer sign in; open new accounts for them and delete the old ones in **Authentication → Users**.

**Phone sign-up caveats.** The number is not verified (no SMS), so anyone can register with any number; the coach's approval is the gate, and a new account can do nothing until approved. A number can only be registered once (Supabase enforces it). Numbers are stored as E.164 (`+9725XXXXXXXX`) and shown as `050-123-4567`. There is no self-service password reset (that needs SMS): the team has to help, and an admin "set a new password" action is not built (it would need the `service_role` key, which this app deliberately does not hold).

This is the only manual SQL step. Everything else is done from the admin screens.

**Staff for community events.** There is no separate staff role: anyone who may publish events is an approved `admin` (same SQL as above). Admins also manage sessions and members. Roles can only be changed in the database, never by a user.

**Event images.** The community-events migration creates the public `event-images` bucket (jpeg/png/webp, 4 MB) and its storage policies. If a project rejects `create policy ... on storage.objects` from the SQL Editor, create the bucket in **Storage** with the same settings and add the four admin-only policies from the migration there.

### First-run checklist (because the live integration is unverified)

1. Register a trainee (name, phone, password) → she lands on the "ההרשמה שלך התקבלה" page straight away. Then log out and log back in with the phone number and password.
2. Log in as the admin → **מתאמנות** → approve the trainee, set her level, assign a plan.
3. **לוח אימונים** → create sessions for next week → publish.
4. Log in as the trainee → book → cancel → check the allowance card.
5. If an admin action fails with a generic error, check the Supabase logs (PostgREST / Postgres) - the RPC names and argument names are in `src/server/services`.

## Deployment (Vercel)

1. Push the repo to GitHub and import it in Vercel (framework preset: Next.js).
2. Set the three environment variables above for Production (and Preview if desired). `NEXT_PUBLIC_APP_URL` must be the final public URL.
3. Deploy. Then update the Supabase Site URL and Redirect URLs to the deployed domain.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | unit + DB tests |
| `npm run test:unit` | pure TypeScript tests (fast) |
| `npm run events:import:dry-run` | offline dry run of the annual-events import: validates `data/padelliel_annual_events_2026_2027.json` and prints the 12 planned drafts. No database connection, writes nothing |
| `npm run test:db` | SQL tests against an embedded PostgreSQL 18 - no Docker or Supabase needed (first run downloads the Postgres binary) |

## Using the app

**Trainee:** home (this month's quota and upcoming sessions) → schedule (book, join the waiting list, cancel) → my sessions → profile.
A cancellation up to 8 hours before the session returns the session to the monthly quota; after that the spot is released but the session
still counts. The app asks for explicit confirmation before a late cancellation, and before booking a session that starts in under 8 hours.

**Coach (admin):** dashboard → schedule (bulk-create by days × time slots × levels, duplicate a week, publish, WhatsApp message) → session page
(roster, attendance, manual assignment, waiting list, cancel session) → members (approve, level, plan, manual allowance adjustments) →
plans → settings (cutoff hours, default capacity and time slots) → audit log. **Events** (`/admin/events`): create, edit, save as draft, publish, unpublish and delete announcements with an optional cover image.

**Community events:** the trainee tab **אירועים בקהילה** (`/events`) lists published events (upcoming first, then **אירועי עבר**) and opens each one for its full details. It is purely informational: no registration, RSVP, payments or notifications, and it never touches the monthly quota.

**Event preview:** staff see an event exactly as trainees do through a **תצוגה מקדימה** button, marked with a "תצוגה מקדימה" badge. In the create/edit form it previews the unsaved values in the browser only (nothing is saved or published, and the existing event is untouched), with actions to go back to editing or to save and publish. From the events list, `/admin/events/[id]/preview` previews a saved draft or published event (admin-only, read-only). Drafts are never exposed to trainees, even by direct URL: `/events/[id]` only loads published events and the database policies hide drafts. Both previews render the same `EventDetails` component as the trainee page.

**Annual events import (drafts, admin only):** `/admin/events/import` (button **ייבוא אירועי שנה** on the events page) loads the 12 community events from `data/padelliel_annual_events_2026_2027.json` as **drafts**. The flyer gives dates only, so the drafts are *date-only* (a date, or the Oct 11-15 range) with no start time and no image; nothing is invented, and nothing is published automatically.
- **Dry run first:** the page (read-only) lists the 12 planned drafts and any existing events they match. `npm run events:import:dry-run` prints the same plan offline.
- **Writing needs three things:** an approved admin, `ALLOW_EVENT_IMPORT=1` on the server, and typing the confirmation phrase. It only INSERTs missing drafts: events that already exist (same `import_key`, or the same title on the same date) are skipped and never changed, so re-running is safe and staff edits are kept. A draft the staff deleted is created again on the next run.
- **Publishing without a time:** an event is always in exactly one of these states (the database enforces it, not just the form):
  1. published with a date and time (`starts_at`, optional `ends_at`);
  2. published with a date and **no time** (`date_start`);
  3. published multi-day, start and end date, **no hours** (`date_start` + `date_end`);
  4. a draft with date-only information (same columns as 2 and 3);
  5. no date at all: allowed **only as a draft**; publishing it is refused by the form, the service and the database.

  Publishing always needs a date and a description, never a time. Trainees see **"השעה תפורסם בהמשך"** where the time would be; no time is ever invented. A date-only event stays *upcoming* until the **end of its last calendar day in Asia/Jerusalem** (it moves to *past* at 00:00 Israel time on the following day, DST-safe), and a timed event moves at its end time as before. Two generated columns do this in the database: `effective_ends_at` (the end of the event) and `effective_starts_at` (its start, or Israel midnight of the first day for a date-only event); trainee lists sort and filter by them. A timed event with a start time but only an end *date* is refused: multi-day events with hours need an end time, otherwise leave the times out. Admins can preview drafts at any time; trainees see an event only after it is published individually (RLS unchanged).

## Repository layout

```
src/app/               routes: (auth), (member), admin, auth/callback, setup
src/components/        UI kit + member/admin client components
src/lib/               domain (types, labels, errors, generators), time, validation, supabase client
src/server/            auth guards, server-action helpers, RPC wrappers (services)
tests/db/              PostgreSQL integration tests (incl. concurrency)
tests/unit/            unit tests
```
