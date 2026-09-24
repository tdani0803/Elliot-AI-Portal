# ElliotAI Client Portal — Technical notes

> New here? Start with the simple step-by-step guide in the main [README](../README.md). This page is the deeper detail.

A secure dashboard where each ElliotAI client, a trade business, logs in and sees what their AI receptionist did for them: calls answered, leads captured, time saved and an honest dollar estimate. Each client sees only their own data. The database enforces this, not just the UI.

## What's in here

| Path | What it is |
|---|---|
| `index.html` | Login (email + password, logo, nothing else) |
| `signup.html` | Self-service login creation (shows nothing until linked to a business) |
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
3. Go to **Authentication → Sign In / Providers**: keep **Allow new users to sign up** on and turn **Confirm email** off. Anyone can create a login on `/signup.html`, but row-level security means it sees nothing until you link it to a `clients` row. This avoids Supabase's built-in email limit, which is only a few emails per hour on the free plan. To go invite-only later, turn sign-ups off and set up custom SMTP.
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
- The portal logo is an HTML/CSS wordmark (`.wordmark` in `src/styles/app.css`). `public/logo.png` is the same logo as an image for other uses. The browser icon is `public/favicon.png`, and the app icons are `public/icon-*.png` and `public/apple-touch-icon.png`. Brand colours live in `src/styles/brand.css`.
- Run through the whole flow with a test client: invite → set password → make a real call → it shows up on the dashboard.

## Deliberately left out
Job-software integrations (ServiceM8, simPRO), team/multi-user accounts, per-client theming, and any client-facing settings or admin screens.


## Pro features (migration `20260924000000_pro_features.sql`)

- **calls**: `recording_url`, `transcript`, `summary`, `job_type` (filled by the webhook from the end-of-call report), and `lead_status` (`new`/`called_back`/`quoted`/`won`/`lost`), `won_value`, `notes`, `assigned_to`, plus `status_updated_at`, which a trigger stamps. Logged-in clients may update **only** `lead_status`, `won_value`, `notes` and `assigned_to` on their own calls. This is enforced by column grants and RLS.
- **clients**: `monthly_fee` (used for "paid for itself ×"), `timezone`, `business_hours` (jsonb, `{"mon":["07:00","17:00"], ..., "sun":null}`), `review_url`.
- **client_members**: team logins. `my_client_ids()` (security definer) returns the businesses the current user owns or belongs to. All read policies use it.
- **bookings**: the jobs calendar. Clients have full CRUD on their own rows. The webhook inserts rows with `source = 'elliot'`.

The site and webhook both work **before** this migration is run. The dashboard falls back to the basic columns and shows a notice. The webhook retries a failed save without the new columns.

**Money maths (honest by design):**
- "Money won" is the sum of `won_value` for leads marked Won, counted by when they were marked Won.
- "Still in play" is open leads × average job value × conversion rate. It is always labelled as an estimate.
- "Paid for itself ×" is won ÷ fee for the range: a week is fee ÷ 4.33, a month is the full fee even for a part-month, and all time is fee × whole months since the first call.

**Deliberately not automated yet:** these need an SMS or email provider, so they're one-tap instead.
- **Follow-ups and review requests** open the phone's SMS app with the message pre-filled (`sms:` links).
- **The monthly report** is printed or saved as a PDF from the Report tab.

To automate them later, add Twilio (SMS) or Resend (email) and a Netlify scheduled function.

## Let Elliot book jobs (Vapi tools)

The webhook answers two tools. In Vapi, go to **Tools → Create Tool → Function** and create both with:
- **Server URL:** `https://<your-site>/api/vapi-webhook`
- **Server secret:** your `VAPI_WEBHOOK_SECRET`

Then add both tools to the assistant.

**1. `check_availability`**. Description: *"Check which start times are free on a given day. Call this before offering times."*

```json
{
  "type": "object",
  "properties": {
    "date": { "type": "string", "description": "The day to check, as YYYY-MM-DD" },
    "duration_minutes": { "type": "number", "description": "How long the job takes. Default 60." }
  },
  "required": ["date"]
}
```

**2. `book_job`**. Description: *"Book a job into the calendar once the caller has agreed a time."*

```json
{
  "type": "object",
  "properties": {
    "name": { "type": "string" },
    "phone": { "type": "string" },
    "address": { "type": "string" },
    "job": { "type": "string", "description": "Short description of the work" },
    "start_time": { "type": "string", "description": "Local start time as YYYY-MM-DDTHH:mm, e.g. 2026-09-25T09:00" },
    "duration_minutes": { "type": "number" },
    "notes": { "type": "string" }
  },
  "required": ["job", "start_time"]
}
```

Add this to the assistant's prompt so it uses the right dates:

> Today is {{"now" | date: "%A %d %B %Y", "Australia/Sydney"}}. If the caller wants to book a time, first use check_availability for the day they want and offer up to three of the free times. Once they pick one, use book_job with their name, phone, address, a short job description and the start time in local time (YYYY-MM-DDTHH:mm). Read back the booking confirmation.

Both tools only offer times inside `business_hours` that don't overlap a booked job. Replies are short sentences for Elliot to read out.

**Job type (optional):** add a `job_type` field, such as "Roof leak" or "Gutters", to the Send Text tool arguments or the analysis structured data. The Report's "What people called about" then groups neatly. Without it, the report groups by the `issue` text.


## Phone app, lead alerts and calendar feed (migration `20260925000000_alerts.sql`)

**Installable app (PWA):** `public/manifest.webmanifest`, the icons and `public/sw.js`. The service worker only handles push and notification clicks. There's no offline caching, so deploys show up immediately.

**Lead alerts:** the flow runs like this.
1. The webhook saves the call from the end-of-call report, or mid-call from the Send Text tool (`save_lead`).
2. It then calls `alertIfNewLead()`. That atomically claims the call with `PATCH calls?notified_at=is.null&urgency=in.(…)`, so each lead alerts **once** even though two messages arrive per call.
3. It pushes to every `push_subscriptions` row for the client. Dead subscriptions (404/410) are deleted.
4. If no phone received it, it sends a Twilio SMS straight away, if one is configured.

**Backup SMS:** `netlify/functions/alert-backup.mjs` runs every 5 minutes. It texts about **urgent** leads that meet all of these:
- notified more than 10 minutes ago and less than 6 hours ago,
- still `new`,
- not opened (`alert_opened_at` is null),
- no SMS sent yet.

The claim-by-PATCH on `sms_sent_at` stops the same lead being texted twice. Opening a lead in the portal, including by tapping the notification, sets `alert_opened_at`.

**Notification text:** the title is always `ElliotAI`. The body says only how urgent it is and when to call back, for example `URGENT JOB – call back within 30 minutes. Tap to see details.` There are no names or addresses on the lock screen; tapping opens the lead. The backup text keeps the key details (name, issue, suburb, number), because it can't open the app.

**VAPID keys:** these are generated on first use and stored in `app_secrets`, a table only the service role can read. Set `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` in Netlify to override. `VAPID_SUBJECT` defaults to `mailto:alerts@elliotai.com.au`.

**Calendar feed:** `GET /api/calendar/<clients.calendar_token>.ics` serves the last 30 days and all future bookings as iCalendar. It's one-way: portal to the phone calendar. To revoke a link, set a new `calendar_token` (`update clients set calendar_token = gen_random_uuid() where id = …`).

**Endpoints:**
- `/api/push-config`: public VAPID key.
- `/api/push-test`: push to the caller's own phones. Needs a Supabase access token.
- `/api/calendar/:token.ics`
- `/api/vapi-webhook`

## Send Text tool replacement

If the existing Send Text is Vapi's built-in SMS tool, replace it with a **Function** tool:
- **Name:** `send_text`
- **Description:** *"Send the caller's details to the business once you have them."*
- **Server URL:** `https://<your-site>/api/vapi-webhook`
- **Server secret:** your `VAPI_WEBHOOK_SECRET`

Parameters:

```json
{
  "type": "object",
  "properties": {
    "name": { "type": "string", "description": "Caller's name" },
    "callback_number": { "type": "string", "description": "Best number to call them back on" },
    "address": { "type": "string", "description": "Job address including suburb" },
    "issue": { "type": "string", "description": "Short summary of the problem, e.g. Roof leak over kitchen" },
    "details": { "type": "string", "description": "Any extra details they gave" },
    "urgency": { "type": "string", "enum": ["Urgent", "Somewhat Urgent", "Non-Urgent", "Irrelevant"] },
    "job_type": { "type": "string", "description": "Category, e.g. Roof leak, Gutters, Tiling" },
    "job_value": { "type": "string" }
  },
  "required": ["name", "issue", "urgency"]
}
```

The webhook saves these straight onto the call, sends the new-lead alert, and replies "Details sent."

## Vapi Structured Data

This is the recommended way to get caller details, and needs no tool changes. Put it in the assistant's **Analysis → Structured Data** schema. On newer accounts it's **Structured Outputs**, which arrive in `artifact.structuredOutputs`; the webhook reads both.

```json
{
  "type": "object",
  "properties": {
    "name": { "type": "string", "description": "Caller's name" },
    "callback_number": { "type": "string", "description": "Best number to call them back on" },
    "address": { "type": "string", "description": "Job address including suburb" },
    "issue": { "type": "string", "description": "Short summary of the problem, e.g. Roof leak over kitchen" },
    "details": { "type": "string", "description": "Any extra details they gave" },
    "urgency": { "type": "string", "enum": ["Urgent", "Somewhat Urgent", "Non-Urgent", "Irrelevant"] },
    "job_type": { "type": "string", "description": "Category, e.g. Roof leak, Gutters, Tiling" }
  }
}
```

Vapi's built-in SMS tool has no server URL, so its message body can't be read reliably. Structured Data replaces it as the source of lead details. If `callback_number` is missing, the webhook falls back to the caller ID.

**Webhook auth:** the secret may be sent in any of these three ways:
- the `X-Vapi-Secret` header,
- `Authorization: Bearer <secret>` (a Vapi "Bearer Token" credential),
- `?secret=<secret>` on the Server URL, for Vapi screens without a secret field.

**Supabase keys:** the new `sb_secret_…` keys are sent only in the `apikey` header. Legacy service_role JWTs are sent as `apikey` plus `Authorization: Bearer`.
