# Owner tools: one-time setup (about 20 minutes)

This switches on **your** side of ElliotAI:

- the **owner page**, where you add clients without Supabase
- **costs and profit** for every client
- **alerts to you** when something breaks
- **Stripe billing**

You only do this once, ever.

---

## Step 1: The database updates (Supabase, 5 min)

In **Supabase → SQL Editor**, run each file below as its own **+ New query**, in this order.
**Skip any you've already run.** They're all safe to run twice, so if you're not sure, run it again.

1. `supabase/migrations/20260926000000_delete.sql`
2. `supabase/migrations/20260927000000_state_timezone.sql`
3. `supabase/migrations/20260928000000_follow_ups.sql`
4. `supabase/migrations/20260929000000_owner.sql` ← **new**

To get a file: open it on GitHub, click the **copy** button (two squares, top right of the file), paste it into Supabase, then click **Run**.

---

## Step 2: Tell Netlify who the owner is (3 min)

1. Go to **app.netlify.com**, open your site, then **Site configuration → Environment variables**.
2. Click **Add a variable** for each of these:

| Key | Value | Needed? |
|---|---|---|
| `ADMIN_EMAILS` | The email **you** log in to the portal with | **Yes** |
| `OWNER_PHONE` | Your mobile, e.g. `0412 345 678`. Problems get texted here (once Twilio works) | Optional |

Your phone also gets a notification for every problem, as long as notifications are on for your login.

---

## Step 3: Stripe, so clients pay you automatically (10 min)

1. Make an account at **stripe.com** (choose Australia) and fill in your business and bank details.
2. **Your key:** in Stripe, open **Developers → API keys**. Copy the **Secret key** (starts with `sk_live_`).
   In Netlify, add a variable: `STRIPE_SECRET_KEY` = that key.
   > To practise first, turn on **Test mode** in Stripe and use the `sk_test_` key. Swap to the live key when you're ready.
3. **Tell Stripe where to send updates:** in Stripe, open **Developers → Webhooks → Add endpoint**.
   - **Endpoint URL:**
     ```
     https://elliotai-portal.netlify.app/api/stripe-webhook
     ```
   - **Events:** click **Select events** and tick these 5:
     `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`,
     `customer.subscription.updated`, `customer.subscription.deleted`
   - Click **Add endpoint**. On the next screen, click **Reveal** under **Signing secret** and copy it (starts with `whsec_`).
   - In Netlify, add a variable: `STRIPE_WEBHOOK_SECRET` = that secret.
4. **Let clients change their own card:** in Stripe, open **Settings → Billing → Customer portal** and click **Save** (or **Activate**).

---

## Step 4: Switch it on (2 min)

Netlify only picks up new settings after a new build:

1. In Netlify, go to **Deploys → Trigger deploy → Deploy site**.
2. Wait about 2 minutes.

## Step 5: Open your owner page

```
https://elliotai-portal.netlify.app/owner.html
```

1. Log in with the email you put in `ADMIN_EMAILS`.
2. Add it to your phone's home screen, like the client app.
3. The **"Still to set up"** box lists anything that's missing. When everything is connected, it says **All set up**.

---

## What the owner page shows

- **Monthly revenue, costs and profit** for this month.
  - Costs use what Vapi charged for each call, plus about 8c per text and about $7 per phone number each month.
  - These are estimates. You can change the rates in Netlify with `USD_TO_AUD`, `SMS_COST_AUD`, `PHONE_NUMBER_AUD_PER_MONTH` and `VAPI_USD_PER_MINUTE`.
- **Every client**, with calls, leads, minutes, what they won, and your fee, cost and profit on them.
- **A health dot** for each client:
  - 🟢 working
  - 🟠 no calls for 3+ days
  - 🔴 a problem
  - ⚪ still being set up
- **Problems this week.** You also get a notification (and a text, if `OWNER_PHONE` is set) when:
  - a call comes in on a Vapi assistant that isn't linked to any business
  - Elliot's booking or availability check fails
  - a call can't be saved
  - a text doesn't send
  - a payment fails or a subscription is cancelled
  - a working client has had no calls for 3 days
- **Add a client / Edit** replaces the Supabase paste.
- **Payment link** creates a Stripe page for the client's monthly fee. Once they pay, they show as **Paid**.
