# ElliotAI Client Portal — Technical notes

> New here? Start with the simple step-by-step guide in the main [README](../README.md). This page is the deeper detail.

A secure dashboard where each ElliotAI client, a trade business, logs in and sees what their AI receptionist did for them: calls answered, leads captured, time saved and an honest dollar estimate. Each client sees only their own data. The database enforces this, not just the UI.

## What's in here

| Path | What it is |
|---|---|
| `index.html` | Login (email + password, logo, nothing else) |
| `forgot-password.html` / `reset-password.html` | Forgot-password flow. The reset page also handles first-time invite links. |
| `dashboard.html` | The only screen a client uses: headline value, 4 stat tiles, urgency split, calls log, and a This Week / This Month / All Time toggle |
| `src/styles/brand.css` | Brand tokens (colours, fonts, borders). **Reuse this on the website.** |
| `src/lib/metrics.js` | Dashboard maths (value calculation, date ranges) with unit tests |
| `netlify/functions/vapi-webhook.mjs` | Receives Vapi's end-of-call report and writes the call to Supabase |
| `supabase/migrations/…_init.sql` | Tables, row-level security, stats function, realtime |
| `scripts/create-client.mjs` | Onboards a client (creates login + emails invite + business record) |

## How the numbers work

| Metric | Calculation |
|---|---|
| Calls handled | Count of calls in the range |
| Call minutes | Sum of call durations |
| Avg call length | Minutes ÷ calls |
| Leads captured | Calls tagged Urgent, Somewhat Urgent or Non-Urgent (excludes Irrelevant and untagged calls) |
| Urgency breakdown | Count per urgency tag |
| Estimated value captured / money saved | **Leads × client's average job value × conversion rate (default 30%)** |

The dashboard always shows this line under the dollar figure: *"Estimate based on your average job value ($X) and a 30% typical conversion rate — not a guarantee."* If a client has no average job value set, it shows no dollar figure at all rather than a made-up one.

"This Week" starts Monday and "This Month" starts on the 1st, both in the viewer's local time.

## Data flow

```
Caller ─▶ Vapi assistant ─▶ end-of-call-report ─▶ /api/vapi-webhook (Netlify)
                                                        │  matches assistantId → client
                                                        ▼
                                                 Supabase `calls` table
                                                        │  RLS: client sees own rows only
                                                        ▼
                                              Dashboard (live via Realtime)
```

The webhook reads the caller details (name, callback_number, address, issue, details, urgency, job_value) from the **Send Text tool call** in the call transcript. If that isn't there, it falls back to Vapi's `analysis.structuredData`. It also accepts a flat JSON body with those same fields plus `call_id` and `assistant_id`, for example if you forward from Make or Zapier. Writes are upserts keyed on the Vapi call id, so data that arrives in two pieces merges into one row.

## Setup (one-off)

### 1. Supabase
1. Create a project at supabase.com (Sydney region).
2. Open **SQL Editor**, paste `supabase/migrations/20260923000000_init.sql`, and run it. With the Supabase CLI, `supabase db push` does the same.
3. Go to **Authentication → Providers → Email**: keep it on and **turn off "Allow new users to sign up"**. Clients only get in by invite.
4. Go to **Authentication → URL Configuration**: set Site URL to `https://portal.elliotai.com.au` and add `https://portal.elliotai.com.au/reset-password.html` to the redirect URLs.
5. Optional: edit the **Invite** and **Reset password** email templates so they sound like ElliotAI.

### 2. Netlify
1. Create a new site from this repo. `netlify.toml` already sets the build command, publish folder and functions folder.
2. Set these environment variables in **Site settings → Environment variables**:

   | Variable | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | Supabase project URL |
   | `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key |
   | `SUPABASE_URL` | Same project URL (used by the webhook) |
   | `SUPABASE_SERVICE_ROLE_KEY` | Service role key. **Secret: never put it in a `VITE_` variable.** |
   | `VAPI_WEBHOOK_SECRET` | A long random string |

3. Under **Domain management**, add `portal.elliotai.com.au` and point a CNAME at the Netlify site.

### 3. Vapi (per assistant)
- Set **Server URL** to `https://portal.elliotai.com.au/api/vapi-webhook`.
- Set **Server secret** (sent as the `X-Vapi-Secret` header) to your `VAPI_WEBHOOK_SECRET`.
- Make sure `end-of-call-report` is included in the server messages. It is by default.

## Onboarding a new client

```bash
cp .env.example .env   # fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PORTAL_URL
node --env-file=.env scripts/create-client.mjs \
  --email owner@acmeroofing.com.au \
  --business "Acme Roofing" \
  --avg-job-value 2500 \
  --assistant-id <their Vapi assistant id>
```

This emails them an invite. They click it, choose a password, and land on their dashboard. To change a client's job value or conversion rate later, edit their row in Supabase → Table Editor → `clients`. There is deliberately no settings screen.

## Local development

```bash
npm install
npm run dev     # needs VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env
npm test        # webhook parsing + dashboard maths
```

To preview with sample data and no Supabase project, set `VITE_DEMO_MODE=true` in `.env`. Any email and password will log in, and a banner marks the data as sample data. Never set this on the live site.

To test the webhook locally, run `netlify dev`, then:

```bash
curl -X POST http://localhost:8888/api/vapi-webhook \
  -H "X-Vapi-Secret: $VAPI_WEBHOOK_SECRET" -H "Content-Type: application/json" \
  -d '{"call_id":"test-1","assistant_id":"<assistant id>","name":"Test Caller","issue":"Leaking roof","urgency":"Urgent","duration_seconds":180}'
```

## Before going live
- The logo is `public/logo.png` and the browser icon is `public/favicon.png`. To change them, replace the files and keep the same names.
- Run through the whole flow with a test client: invite → set password → make a real call → it shows up on the dashboard.

## Deliberately left out
Job-software integrations (ServiceM8, simPRO), team/multi-user accounts, per-client theming, and any client-facing settings or admin screens.
