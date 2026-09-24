# ElliotAI Client Portal — Setup Guide

This guide gets your client portal live on the internet.
You don't need to know how to code. You just click and copy-paste.

⏱️ **Time:** about 45 minutes
💰 **Cost:** $0 (all free plans)

👉 **Already did Parts 1 and 2? Jump to [Part 3](#part-3--change-2-supabase-settings--2-min).**

---

## Before you start

You need 3 things open in your web browser:

1. **GitHub**, where this code lives. You already have this.
2. **Supabase** at [supabase.com](https://supabase.com). It stores the logins and the calls.
3. **Netlify** at [netlify.com](https://netlify.com). It puts the website on the internet.

📝 **Also open a notes app** (like Notes on your phone or Notepad on a computer).
You will copy some codes along the way. Paste each one into your notes so you don't lose it.

> 🔒 **Keep your notes private.** Some of the codes are like passwords. Never send them to anyone or post them online.

---

## Part 1 — Set up Supabase (the storage) · 15 min

### Step 1: Make an account and a project

1. Go to [supabase.com](https://supabase.com) and click **Start your project**.
2. Sign up. The easiest way is to click **Continue with GitHub**.
3. Click **New project**.
4. Fill in the boxes:
   - **Name:** `elliotai-portal`
   - **Database password:** click **Generate a password**. Copy it into your notes.
   - **Region:** pick **Sydney**.
5. Click **Create new project**.
6. Wait about 2 minutes while it gets ready.

### Step 2: Build the storage tables

This step creates the places where calls and clients are saved.

1. Open this file on GitHub: `supabase/migrations/20260923000000_init.sql`
2. Click the **Copy raw file** button. It looks like two small squares, at the top right of the file.
3. Go back to Supabase. On the left side, click **SQL Editor** (the icon looks like `>_`).
4. Click in the big empty box and paste. On Windows press **Ctrl + V**; on a Mac press **Cmd + V**.
5. Click the green **Run** button at the bottom right.
6. You should see **"Success. No rows returned."** ✅

### Step 3: Let people make their own account

1. On the left, click **Authentication**.
2. Click **Sign In / Providers**.
3. Make sure **Allow new users to sign up** is **ON**.
4. Turn **Confirm email** **OFF**. This means no emails are needed to sign up.
5. Click **Save**.

> Don't worry: a new account can't see anything until **you** link it to a business (Part 6).

### Step 4: Copy your 3 Supabase codes

1. On the left, click **Project Settings** (the ⚙️ gear at the bottom).
2. Click **Data API**. Copy the **Project URL** into your notes and label it `URL`.
   - It looks like `https://abcdefgh.supabase.co`
3. Click **API Keys**. Copy these 2 keys into your notes:
   - The **publishable** key. It might be called **anon** instead. Label it `PUBLIC KEY`.
   - The **secret** key. It might be called **service_role** instead. Label it `SECRET KEY`.

> ⚠️ The **SECRET KEY** is like the master key to your whole system. Only ever paste it into Netlify, in Part 2.

---

## Part 2 — Put the website online with Netlify · 10 min

### Step 5: Connect Netlify to GitHub

1. Go to [netlify.com](https://netlify.com) and sign up with **GitHub**.
2. Click **Add new project** (it might say **Add new site**), then **Import an existing project**.
3. Click **GitHub**. If it asks for permission, click **Authorize**.
4. Pick the **Elliot-AI-Portal** repository.
5. If it asks which **branch** to use, pick the one that starts with `claude/elliotai-client-portal`.
6. Leave the other settings alone. They are already set up for you.

### Step 6: Add your secret settings

Still on that same page, look for **Environment variables** and click **Add environment variables**.
If you can't see it, do it right after the site is made. It's under **Site configuration → Environment variables**.

Add these **5** settings. Type the name **exactly** as shown, with capital letters and underscores.

| Name (type exactly) | Value (paste from your notes) |
|---|---|
| `VITE_SUPABASE_URL` | your `URL` |
| `VITE_SUPABASE_ANON_KEY` | your `PUBLIC KEY` |
| `SUPABASE_URL` | your `URL` again |
| `SUPABASE_SERVICE_ROLE_KEY` | your `SECRET KEY` |
| `VAPI_WEBHOOK_SECRET` | make up a long password, 30 or more random letters and numbers. **Copy it into your notes** and label it `VAPI SECRET`. |

Then click **Deploy**.

> ⚠️ **Added these settings after the site was already made?** Then you must rebuild it: **Deploys → Trigger deploy → Deploy site**. See Part 4.

### Step 7: Get your website address

1. Wait about 1 minute until it says **Published**.
2. At the top you'll see an address like `https://something-random-123.netlify.app`.
3. Copy it into your notes and label it `WEBSITE`.
4. Click it. You should see the ElliotAI login page. 🎉

> **Tip:** Want a nicer name? Go to **Site configuration → Change site name** and type something like `elliotai-portal`. Your address becomes `https://elliotai-portal.netlify.app`. Update `WEBSITE` in your notes.

### Step 8: Tell Supabase your website address

This makes the "forgot password" and invite emails send people to the right place.

1. Go back to **Supabase → Authentication → URL Configuration**.
2. In **Site URL**, paste your `WEBSITE`. Click **Save**.
3. Under **Redirect URLs**, click **Add URL** and paste your `WEBSITE` with `/**` on the end. For example: `https://elliotai-portal.netlify.app/**`
4. Click **Save**.

---

## Part 3 — Change 2 Supabase settings · 2 min

This lets people make their own account without any emails. (Supabase only sends a few emails each hour for free, which is why yours stopped.)

1. In **Supabase**, click **Authentication** on the left.
2. Click **Sign In / Providers**.
3. Turn **Allow new users to sign up** **ON**.
4. Turn **Confirm email** **OFF**.
5. Click **Save**.

---

## Part 4 — Make sure the website is up to date · 2 min

1. In **Netlify**, open your site and click **Deploys**.
2. The top one should say **Published**. If it says **Building**, wait 1 minute.
3. Open your `WEBSITE`. You should see the login page with a **Create an account** link at the bottom. ✅

> **Don't see "Create an account"?** Click **Trigger deploy → Deploy site** and wait 1 minute.

---

## Part 5 — Make your account · 1 min

1. On your `WEBSITE`, click **Create an account**.
2. Type your email and a password (8 or more letters and numbers), twice.
3. Click **Create account**.

You'll see a page that says **"ElliotAI just needs to link it to your business."** That's correct! Your login works, but it isn't linked to anything yet. That's the next part.

> **"There's already an account with that email"?** You made one earlier. Delete it first: **Supabase → Authentication → Users**, click the **⋯** next to your email, then **Delete user**. Then try again.

---

## Part 6 — Link your account to a business · 3 min

**This is the step that connects everything.** A login on its own shows nothing. It only shows calls once it's linked to a business here.

1. In **Supabase**, click **Table Editor** on the left (it looks like a grid).
2. Click the **clients** table.
3. **Already have a row there from before?** Click its **user_id** box and change it to your email. Then skip to step 6.
   **No row yet?** Click **Insert**, then **Insert row**.
4. Fill in these boxes:

   | Box | What to put |
   |---|---|
   | **id** | Leave empty. It fills itself in. |
   | **user_id** | Click it and pick your email |
   | **business_name** | A name, like `Test Roofing` |
   | **avg_job_value** | A number, like `2500` |
   | Everything else | Leave alone for now |

5. Click **Save**.
6. Go back to your `WEBSITE` and refresh the page. You should see **your business name** at the top and a dashboard with zeros. ✅

> **Can't pick your email in user_id?** Go to **Authentication → Users**, click your email, copy the **User UID** (a long code), and paste it into the **user_id** box.

---

## Part 7 — Connect Vapi · 5 min

### Step A: Put the assistant's ID into Supabase

1. In **Vapi**, open your assistant.
2. Copy the assistant's **ID**. It's the long code at the top, near the name.
3. In **Supabase → Table Editor → clients**, click the **vapi_assistant_id** box on your row.
4. Paste the ID and press **Enter**.

### Step B: Tell Vapi where to send calls

1. In **Vapi**, on your assistant, find **Server URL**. Try the **Advanced** tab, or a section called **Server** or **Messaging**.
2. Paste in your link, built from **3 pieces with no spaces**:

   ```
   your WEBSITE  +  /api/vapi-webhook?secret=  +  your VAPI SECRET
   ```

   For example: `https://elliotai-portal.netlify.app/api/vapi-webhook?secret=abc123xyz789`

3. **Only if you also see a Secret box** next to it, paste your `VAPI SECRET` in there too. If there's no Secret box, that's fine: the secret is already in the link.
4. Click **Publish**.

> Your `VAPI SECRET` should be letters and numbers only. If it has symbols like `&`, `#` or `?`, change it in Netlify (Step 6) to letters and numbers, then redeploy.

---

## Part 8 — Test call · 2 min

1. **Call your AI receptionist** and pretend to be a customer with a job.
2. Hang up. Wait about 10 seconds.
3. Look at your dashboard. The call is there, with the caller's name, what they need and how urgent it is. 🎉 **You're done!**

### Adding a real client later

1. The client goes to your `WEBSITE` and clicks **Create an account**.
2. You do **Part 6** for them. Pick their email and type in their business name and average job value.
3. You do **Part 7** with **their** Vapi assistant.

---

## Part 9 — Switch on the new features · 10 min

This turns on **Leads, Jobs, Customers and Report**. Until you do it, the website still works. It just shows a small blue note at the top.

### Step A: Run the update in Supabase

1. Open this file on GitHub: `supabase/migrations/20260924000000_pro_features.sql`
2. Click **Copy raw file** (the two small squares, top right).
3. In **Supabase**, click **SQL Editor** (`>_`), then **+ New query**.
4. Paste it in and click **Run**. You should see **"Success. No rows returned."** ✅

> Only run this **once**. If you run it a second time you'll see an error saying something "already exists". That's fine. It means it's already done.

### Step B: Fill in the new business details

1. In Supabase, go to **Table Editor**, then **clients**, and find your row.
2. Fill in these new boxes:

   | Box | What to put |
   |---|---|
   | **monthly_fee** | What this client pays you each month, numbers only, like `750`. This powers "Elliot paid for itself 12×". |
   | **review_url** | Their Google review link. Used by the **Ask for review** button. |
   | **business_hours** | Leave it as is (Mon–Fri, 7am–5pm). To change it, edit the times. Use `null` for closed days. |
   | **state** | Their state: `QLD`, `NSW`, `VIC`, `TAS`, `ACT`, `SA`, `NT` or `WA`. The **timezone** fills itself in (after running `20260927000000_state_timezone.sql`). |

3. Refresh your website. You'll see the tabs at the bottom: **Home, Leads, Jobs, Customers, Report**. 🎉

### Step C (optional): Add a worker's login

1. The worker makes their own account on your `WEBSITE` (**Create an account**).
2. In Supabase, go to **Table Editor**, then **client_members**, then **Insert row**:
   - **client_id**: pick the business.
   - **user_id**: pick the worker's email.
   - **display_name**: their first name, like `Jake`.
3. Click **Save**. They can now log in and see the same dashboard, and you can put their name on leads and jobs.

### Step D (optional): Let Elliot book jobs during calls

This lets Elliot check your calendar and book the job while the customer is still on the phone. See **"Let Elliot book jobs"** in [docs/TECHNICAL.md](docs/TECHNICAL.md#let-elliot-book-jobs-vapi-tools). It's a copy-paste job in Vapi.

---

## Part 10 — Phone app and new-lead alerts · 15 min

This turns ElliotAI into an app on the tradie's phone. It buzzes them for every new lead, so they don't need a text for each call any more.

### Step A: Run the second update in Supabase

Same as Part 9 Step A, but with this file: `supabase/migrations/20260925000000_alerts.sql`. It's safe to run more than once.

### Step A2: Run the delete update

So you can delete calls and customers in the portal. Same again (**+ New query**), with this file: `supabase/migrations/20260926000000_delete.sql`. Safe to run more than once.

### Step B: Fill in 3 boxes in the client's row

Go to **Supabase → Table Editor → clients**:

| Box | What to put |
|---|---|
| **callback_urgent_minutes** | How fast Elliot promises urgent callers a call back. `60` = within 1 hour. |
| **callback_standard_minutes** | The same for everyone else. `240` = within 4 hours. |
| **alert_phone** | The tradie's mobile, like `0412 345 678`. Used only for backup texts. |

> ⚠️ **Elliot must say the same thing.** In Vapi, make sure the assistant's prompt tells callers the same times, for example *"If it's urgent, tell them someone will call back within 1 hour. Otherwise, within 4 hours."* The notification repeats this promise, and the portal marks the lead **Overdue** once the time passes.

### Step C: Let Vapi hand over the caller's details

You **don't** need to change your SMS tool. Vapi can pick out the caller's details at the end of every call by itself, and send them to the portal.

1. In **Vapi**, open your assistant and click the **Analysis** tab.
2. Find **Structured Data** (on newer accounts it may be called **Structured Outputs**) and turn it on.
3. In the **prompt** box, paste:
   > Pull out the caller's details from this call. Urgency must be exactly one of: Urgent, Somewhat Urgent, Non-Urgent, Irrelevant. Use Irrelevant for spam, wrong numbers or anything that isn't a job.
4. Add these fields. Each one is a **string** (text):

   | Field name (type exactly) | Description |
   |---|---|
   | `name` | Caller's name |
   | `callback_number` | Best number to call them back on |
   | `address` | Job address including suburb |
   | `issue` | Short summary of the problem, e.g. Roof leak over kitchen |
   | `details` | Any extra details they gave |
   | `urgency` | Urgent, Somewhat Urgent, Non-Urgent or Irrelevant |
   | `job_type` | Type of job, e.g. Roof leak, Gutters, Tiling |

   If Vapi lets you paste JSON instead, use the one in [docs/TECHNICAL.md](docs/TECHNICAL.md#vapi-structured-data).
5. Click **Publish**.

**Once the test notification works (Step D),** remove the old **SMS tool** from the assistant. Otherwise the tradie gets both a text and a notification for every call. Until then, leave it on as a safety net.

### Step D: Set up the phone (do this with each client, it takes 1 minute)

**iPhone**
1. Open your `WEBSITE` in **Safari**. It must be Safari.
2. Tap the **Share** button (the square with an arrow), then **Add to Home Screen**, then **Add**.
3. Open **ElliotAI** from the home screen and log in.
4. Tap **Turn on notifications**, then **Allow**.
5. Scroll to the bottom of Home and tap **Send a test**. A notification should pop up. ✅

**Android**
1. Open your `WEBSITE` in **Chrome** and log in.
2. Tap **Turn on notifications**, then **Allow**.
3. Tap **Add to home screen** if it shows. If not, use Chrome's **⋮** menu, then **Add to Home screen**.
4. Tap **Send a test** at the bottom of Home. ✅

### Step E (optional but recommended): Backup texts

A backup text is only sent when:
- the tradie hasn't turned notifications on yet, **or**
- an **urgent** lead's notification hasn't been opened within **10 minutes**.

To switch this on:
1. Make an account at [twilio.com](https://www.twilio.com). Texts cost about 5–10c each.
2. In Twilio, either buy an Australian number or set up a sender name like `ElliotAI`. Twilio walks you through it.
3. In **Netlify**, go to **Site configuration → Environment variables** and add these 3 settings:

   | Name | Value |
   |---|---|
   | `TWILIO_ACCOUNT_SID` | From your Twilio dashboard (starts with `AC`) |
   | `TWILIO_AUTH_TOKEN` | From your Twilio dashboard |
   | `TWILIO_FROM_NUMBER` | Your Twilio number, like `+61412345678`, or your sender name |

4. Go to **Deploys**, then **Trigger deploy**.

Until this is set up, everything else still works. There's just no backup text.

---

## What each tab does

| Tab | What it's for |
|---|---|
| **Home** | Money won, who to call back, and the key numbers at a glance. |
| **Leads** | Every call. Tap one to hear the recording, read the summary, call or text them, and move it along: **New → Called → Quoted → Won / Lost**. When you tap **Won**, type what the job was worth. That becomes real money on the Home screen. |
| **Jobs** | Your bookings, day by day. Tap **Book a job**, or book straight from a lead. Jobs Elliot booked say **Booked by Elliot**. Tap **Show these jobs in my phone's calendar** to see them in Apple, Google or Outlook calendar. |
| **Customers** | Everyone who's called, with their history. Repeat callers are marked. |
| **Report** | The monthly summary: money, call-to-job funnel, what people call about, suburbs and busiest times. Tap **Save as PDF** to send it to someone. |

---

## Something not working?

| Problem | Fix |
|---|---|
| The website shows a blank white page | In Netlify, check that all 5 names in Step 6 are spelled **exactly** right. Then go to **Deploys → Trigger deploy → Deploy site**. |
| "That email and password don't match" | Check for typos. Or delete the user in **Supabase → Authentication → Users** and do Part 5 again. |
| "ElliotAI just needs to link it to your business" | Do Part 6. Make sure you picked the right email in **user_id**. |
| The buttons do nothing, or a pink "Setup problem" box appears | In Netlify, check the 5 settings from Step 6, then **Deploys → Trigger deploy → Deploy site**. |
| No notification on the phone | On iPhone, it must be opened from the **home screen** icon, not Safari. Check the phone's **Settings → Notifications → ElliotAI** is on, and **Do Not Disturb / Focus** is off. Then tap **Send a test** on Home. |
| A call doesn't show up | 1. Check the Vapi **Server URL** ends in `/api/vapi-webhook`. 2. Check the Vapi secret matches `VAPI_WEBHOOK_SECRET` in Netlify **exactly**. 3. Check the **vapi_assistant_id** in Supabase matches the assistant's ID in Vapi **exactly**. |
| I want to see what went wrong | In Netlify, go to **Logs → Functions → vapi-webhook**. Errors show up there. |

---

## Optional: use your own web address

Want clients to log in at `portal.elliotai.com.au`?

1. In Netlify, go to **Domain management → Add a domain**. Type `portal.elliotai.com.au`.
2. Netlify shows you a **CNAME** record. Log in to the place you bought `elliotai.com.au` (like GoDaddy, Crazy Domains or VentraIP). Add that record there.
3. Wait up to 1 hour for it to start working.
4. Then **update your address everywhere you used it:**
   - In Supabase, change the **Site URL** and **Redirect URLs** (Step 8).
   - In Vapi, change the **Server URL** for each assistant (Part 7).

---

## Changing the logo

The logo in the portal is plain text (**ElliotAI** in the Sora font), so it always looks sharp. `public/logo.png` is a picture of the same logo for your website, emails or socials. The phone app icon is `public/icon-512.png` (and the other `icon-` files).

---

**Are you a developer?** The technical details are in [docs/TECHNICAL.md](docs/TECHNICAL.md).
