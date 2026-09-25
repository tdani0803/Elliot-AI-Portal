# Go live: the whole setup, in order (about 1 hour)

Do these top to bottom. Tick each box as you go.
Everything in Netlify is saved **before** the one build in Part 4, so it only costs one build.

---

## Part 1: Supabase database updates (5 min)

In **Supabase → SQL Editor**, run each file as its own **+ New query**, in this order.
They're all safe to run again, so if you're not sure whether you ran one, run it.

To get each file: open it on GitHub, click the **copy** button (two squares, top right), paste it into Supabase, then click **Run**.

- [ ] `supabase/migrations/20260926000000_delete.sql`
- [ ] `supabase/migrations/20260927000000_state_timezone.sql`
- [ ] `supabase/migrations/20260928000000_follow_ups.sql`
- [ ] `supabase/migrations/20260929000000_owner.sql`

Each should say **Success**.

---

## Part 2: New secret keys (10 min, important)

Your Supabase secret key and Vapi secret were typed into a chat, so replace them.

### 2A: New Supabase secret key
- [ ] In **Supabase**, open **Project Settings → API Keys**.
- [ ] Under **Secret keys**, click **+ Add new secret key**, name it `netlify`, and click **Create**. Copy it.
- [ ] Keep this tab open. You paste it into Netlify in Part 3, and delete the old key in Part 5.

### 2B: New Vapi secret
- [ ] Make up a new secret: **letters and numbers only**, at least 20 characters, for example `k7Rm2QxP9vT4wLs8Na3Y`.
- [ ] Write it down. You use it in Part 3 and Part 5.

---

## Part 3: Netlify settings (5 min)

Go to **app.netlify.com**, open your site, then **Site configuration → Environment variables**.
To change a value: click the variable, then **Options → Edit**. To add one: click **Add a variable**.

| Key | Value | |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | The new Supabase key from 2A | **Change** |
| `VAPI_WEBHOOK_SECRET` | The new secret from 2B | **Change** |
| `ADMIN_EMAILS` | The email **you** log in with | **Add** |
| `OWNER_PHONE` | Your mobile, e.g. `0412 345 678` | Add (optional) |
| `STRIPE_SECRET_KEY` | From Part 3B below | Add |
| `STRIPE_WEBHOOK_SECRET` | From Part 3B below | Add |

### 3B: Stripe (10 min)
- [ ] Make an account at **stripe.com** (Australia) and add your business and bank details.
- [ ] Open **Developers → API keys**. Copy the **Secret key** (`sk_live_…`, or `sk_test_…` to practise first) into `STRIPE_SECRET_KEY`.
- [ ] Open **Developers → Webhooks → Add endpoint**:
  - **Endpoint URL:** `https://elliotai-portal.netlify.app/api/stripe-webhook`
  - **Events:** tick these 5: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`
  - Click **Add endpoint**. Then click **Reveal** under **Signing secret** and copy it (`whsec_…`) into `STRIPE_WEBHOOK_SECRET`.
- [ ] Open **Settings → Billing → Customer portal** and click **Save** (or **Activate**).

> Not ready for Stripe yet? Skip 3B. Everything else works without it, and you can add it later (it then needs one more build).

---

## Part 4: Build the new version (3 min)

- [ ] In Netlify, open **Deploys**, then **Trigger deploy → Deploy site**.
- [ ] Wait until the top one says **Published** (about 2 minutes).

---

## Part 5: Point Vapi at the new secret (5 min, straight after Part 4)

The new link, with your new secret on the end:
```
https://elliotai-portal.netlify.app/api/vapi-webhook?secret=YOUR-NEW-SECRET
```

- [ ] In **Vapi → Assistants → your assistant → Advanced**, paste it into **Server URL**, then **Publish**.
- [ ] In **Vapi → Tools**, paste the same link into **check_availability** and **book_job** (each tool's **Server URL**), then **Save** each one.
- [ ] Back in **Supabase → API Keys**, delete the **old** secret key (click ⋯, then **Delete**).

---

## Part 6: Your test business (10 min)

- [ ] Open **https://elliotai-portal.netlify.app/owner.html** and log in.
- [ ] On your test business's card, tap **Edit**. Check the state, hours, your mobile, and that the **Vapi assistant ID** is filled in. Tap **Save**.
- [ ] In Vapi, make sure your assistant is using the latest prompt:
  - Queensland version: `docs/vapi-prompt.md`
  - Any-trade template: `docs/prompt-template.md`
- [ ] Check the assistant has **check_availability**, **book_job** and **End Call** under **Tools**, and that **End Call Phrases** is empty.

---

## Part 7: Your phone (3 min)

- [ ] Delete the old ElliotAI app from your home screen.
- [ ] In **Safari**, open `https://elliotai-portal.netlify.app`, log in, then tap **Share → Add to Home Screen**.
- [ ] Open the app. Tap **⚙️** and scroll down: it should say **Version** followed by a code. Send me the code if you want me to confirm it's the latest.
- [ ] On **Home**, tap **Turn on** for notifications, then **⚙️ → Send a test**. Your phone should buzz.
- [ ] Also add **owner.html** to your home screen, so you have both apps.

---

## Part 8: Test everything (15 min)

Call your Elliot number (or use **Talk** in Vapi) and try each one:

| # | Do this | You should see |
|---|---|---|
| 1 | Say it's urgent: *"Water's pouring through my ceiling."* Give a name, mobile and address | Your phone buzzes **URGENT JOB** within a minute. The call is on **Home** and in **Calls** with the right job name (e.g. Roof leak) |
| 2 | Call again and ask to book a quote for next Tuesday | Elliot offers times and books one. Your phone buzzes **New job booked**. It shows in **Jobs** and the call says **Booked** |
| 3 | In the app, swipe a call right | It moves to **Called**. **Undo** puts it back |
| 4 | Swipe a call left | It's deleted. **Undo** brings it back |
| 5 | Open **Report**, then **Save as PDF** | A clean 2-page report |
| 6 | Open **⚙️**, then flip a switch off and on | "Turned off" / "Turned on" |
| 7 | Open **owner.html** | Your business shows with this month's calls, a cost and a green dot |
| 8 | Only if Stripe is set up: tap **Payment link** and pay with test card `4242 4242 4242 4242` (in Stripe test mode) | The client shows **Paid** |

If anything doesn't match, send me:
- the test number
- a screenshot
- the latest lines from **Netlify → Logs → Functions → vapi-webhook**

---

## Later: texts (when Twilio is sorted)

Add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM_NUMBER` in Netlify, then do one **Trigger deploy**.
That switches on the thank-you texts, the day-before reminders and the backup texts.
