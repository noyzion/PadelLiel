# PadelLiel – Padel Community Management

Mobile-first, Hebrew / RTL web app for the coaching team and its padel trainees (Kochav Yair). It replaces WhatsApp polls and spreadsheets:
the coach publishes weekly sessions, trainees book and cancel themselves, and the rules (weekly allowance, 8-hour cancellation policy,
capacity, levels, waiting list) are enforced in the database.

**Stack:** Next.js 16 (App Router, TypeScript, React 19, Tailwind 4) · Supabase (PostgreSQL, Auth, RLS) · Vercel.
**Out of scope on purpose:** payments, invoices, checkout, wallets/credits, WhatsApp API automation. The WhatsApp feature only produces a Hebrew
message with the booking link to copy/share.

## Verification status (please read)

| Area | Status |
|---|---|
| SQL business rules, RLS, privileges, concurrency | **Verified** – 117 tests against a real PostgreSQL 18 (`npm run test:db`) |
| Pure TypeScript (time, validation, error mapping, generators) | **Verified** – 29 unit tests |
| Type check, lint, production build | **Verified** (`npm run typecheck`, `npm run lint`, `npm run build`) |
| App boots without env and redirects to `/setup`; `/setup` renders RTL Hebrew | **Verified** (smoke test against `next start`) |
| Against a **live Supabase project**: Auth e-mail flows, PostgREST RPC argument shapes, `.select()` behaviour, RLS through PostgREST | **NOT verified** – no Supabase credentials were available while building. Follow the first-run checklist below. |
| In-browser UI behaviour (modals, dialogs, RTL layout on devices) | **NOT verified** – no browser automation was run |

The DB tests use a stub of Supabase's `auth` schema (`auth.users`, `auth.uid()`), not Supabase itself.

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

The Supabase `service_role` key is **never** used or needed. Do not commit `.env.local`.

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. Apply the SQL migrations **in order** (core schema → booking engine → RLS and grants → seed defaults → admin member list) using the SQL Editor.
   The migration files are not part of this repository and are kept locally. The seed adds the three skill levels, three starter plans (1/2/3 per week) and default settings (8h cutoff, capacity 4, 07:00–08:00 and 08:00–09:00).
3. **Authentication → URL Configuration**
   - Site URL: your app URL (e.g. `https://padel-liel.vercel.app`).
   - Redirect URLs: add `https://<your-app>/auth/callback` and `http://localhost:3000/auth/callback`.
4. **Authentication → Providers → Email**: keep e-mail sign-in enabled. Keeping "Confirm email" on is recommended; new accounts are `pending` until the coach approves them anyway.
5. Register the admin account through the app's `/register` page, confirm the e-mail, then promote it in the SQL Editor:

```sql
update public.profiles
set role = 'admin', approval_status = 'approved'
where email = 'admin@example.com';   -- use the real address
```

This is the only manual SQL step. Everything else is done from the admin screens.

### First-run checklist (because the live integration is unverified)

1. Register a trainee → confirm e-mail → she lands on the "waiting for approval" page.
2. Log in as the admin → **מתאמנות** → approve the trainee, set her level, assign a plan.
3. **לוח אימונים** → create sessions for next week → publish.
4. Log in as the trainee → book → cancel → check the allowance card.
5. If an admin action fails with a generic error, check the Supabase logs (PostgREST / Postgres) – the RPC names and argument names are in `src/server/services`.

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
| `npm run test:db` | SQL tests against an embedded PostgreSQL 18 – no Docker or Supabase needed (first run downloads the Postgres binary) |

## Using the app

**Trainee:** home (this week's allowance and upcoming sessions) → schedule (book, join the waiting list, cancel) → my sessions → profile.
A cancellation up to 8 hours before the session returns the session to the weekly allowance; after that the spot is released but the session
still counts. The app asks for explicit confirmation before a late cancellation, and before booking a session that starts in under 8 hours.

**Coach (admin):** dashboard → schedule (bulk-create by days × time slots × levels, duplicate a week, publish, WhatsApp message) → session page
(roster, attendance, manual assignment, waiting list, cancel session) → members (approve, level, plan, manual allowance adjustments) →
plans → settings (cutoff hours, default capacity and time slots) → audit log.

## Repository layout

```
src/app/               routes: (auth), (member), admin, auth/callback, setup
src/components/        UI kit + member/admin client components
src/lib/               domain (types, labels, errors, generators), time, validation, supabase client
src/server/            auth guards, server-action helpers, RPC wrappers (services)
tests/db/              PostgreSQL integration tests (incl. concurrency)
tests/unit/            unit tests
```
