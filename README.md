# ElliotAI Client Portal — Setup Guide

This guide gets your client portal live on the internet.
You don't need to know how to code. You just click and copy-paste.

⏱️ **Time:** about 45 minutes
💰 **Cost:** $0 (all free plans)

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

### Step 3: Stop strangers from signing up

Only people you invite should be able to log in.

1. On the left, click **Authentication**.
2. Click **Sign In / Providers**.
3. Find **Allow new users to sign up** and turn it **OFF**.
4. Click **Save**.

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

> ⚠️ **Added these settings after the site was already made?** Then you must rebuild it: **Deploys → Trigger deploy → Deploy site**. See Part 3.

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

## Part 3 — Make sure the website works · 5 min

Do this first. The website needs to be rebuilt **after** you add the 5 settings from Step 6.

1. Go to **Netlify** and open your site.
2. Click **Deploys** on the left.
3. Click **Trigger deploy**, then **Deploy site**.
4. Wait until the top one says **Published** (about 1 minute).
5. Open your `WEBSITE`.

**Did a pink box appear that says "Setup problem"?**
- **Yes:** one of the 5 settings in Step 6 is spelled wrong or is missing. Fix it, then do steps 2–4 again.
- **No:** great, the website is working. ✅

> **Good to know:** there's no "sign up" on the website, and that's on purpose. Clients can't make their own account. You invite them in Part 4.

---

## Part 4 — Log in for the first time · 5 min

We'll make **you** the first client so you can test everything.

### Step A: Check your invite

You already sent yourself an invite. That link has probably been used up, so do this instead:

1. Open your `WEBSITE`.
2. Click **Forgot password?**.
3. Type your email and click **Send reset link**.
4. Open the email and click the link.
5. Type a new password twice and click **Save password**.

> **No email arrived?** Check your junk folder. Still nothing? In **Supabase → Authentication → Users**, check your email is in the list. If it isn't, click **Add user → Send invitation** and invite yourself again.

### Step B: Link your login to a business

1. In Supabase, click **Table Editor** on the left (it looks like a grid).
2. Click the **clients** table.
3. Click **Insert**, then **Insert row**.
4. Fill in these boxes:
   - **user_id:** click it and pick your email.
   - **business_name:** a business name, like `Test Roofing`.
   - **avg_job_value:** a number, like `2500`.
   - Leave every other box alone for now.
5. Click **Save**.
6. Go back to your `WEBSITE` and refresh the page.

You should now see your dashboard with your business name at the top. It will be empty, and that's normal. ✅

---

## Part 5 — Connect Vapi · 5 min

This makes calls show up on the dashboard.

### Step A: Copy the assistant's ID

1. Log in to [Vapi](https://dashboard.vapi.ai) and open your **assistant**.
2. Find the assistant's **ID**. It's a long code near the name at the top. Click it to copy.
3. In **Supabase → Table Editor → clients**, click the **vapi_assistant_id** box on your row.
4. Paste the ID and press **Enter**.

### Step B: Tell Vapi where to send calls

1. Back in Vapi, on your assistant, look for **Server URL**. Try the **Advanced** tab.
2. Paste your `WEBSITE` with `/api/vapi-webhook` on the end. For example:
   `https://elliotai-portal.netlify.app/api/vapi-webhook`
3. Find the **Secret** box near it. It might be called **Server Secret**, **Secret Token** or **Credential**.
   Paste your `VAPI SECRET`.
4. Click **Publish** or **Save**.

> **Can't find the Secret box?** Take a screenshot of the page and send it over, and we'll find it together. Without the secret, calls won't show up.

---

## Part 6 — Test call · 2 min

1. **Call your AI receptionist** and pretend to be a customer with a job.
2. Hang up. Wait about 10 seconds.
3. Refresh your dashboard. The call is there. 🎉 **You're done!**

From now on, to add a real client, repeat **Part 4** (using **Add user → Send invitation** for their email) and **Part 5** with their assistant.

---

## Something not working?

| Problem | Fix |
|---|---|
| The website shows a blank white page | In Netlify, check that all 5 names in Step 6 are spelled **exactly** right. Then go to **Deploys → Trigger deploy → Deploy site**. |
| "That email and password don't match" | Click **Forgot password?** on the login page to make a new password. |
| The invite or reset link says "expired" | Links only work once and only for a short time. Send a new invite, or use **Forgot password?**. |
| "Your account isn't linked to a business yet" | Do Part 4 Step B. Make sure you picked the right email in **user_id**. |
| The buttons do nothing, or a pink "Setup problem" box appears | Do Part 3. |
| The email link opens a page that won't load, or says `localhost` | Do Step 8 (Site URL and Redirect URLs in Supabase). Then ask for a new link. |
| A call doesn't show up | 1. Check the Vapi **Server URL** ends in `/api/vapi-webhook`. 2. Check the Vapi secret matches `VAPI_WEBHOOK_SECRET` in Netlify **exactly**. 3. Check the **vapi_assistant_id** in Supabase matches the assistant's ID in Vapi. |
| I want to see what went wrong | In Netlify, go to **Logs → Functions → vapi-webhook**. Errors show up there. |

---

## Optional: use your own web address

Want clients to log in at `portal.elliotai.com.au`?

1. In Netlify, go to **Domain management → Add a domain**. Type `portal.elliotai.com.au`.
2. Netlify shows you a **CNAME** record. Log in to the place you bought `elliotai.com.au` (like GoDaddy, Crazy Domains or VentraIP). Add that record there.
3. Wait up to 1 hour for it to start working.
4. Then **update your address everywhere you used it:**
   - In Supabase, change the **Site URL** and **Redirect URLs** (Step 8).
   - In Vapi, change the **Server URL** for each assistant (Part 5).

---

## Changing the logo

The logo is the file `public/logo.png`. To change it, upload a new picture with the **same name** on GitHub. Netlify updates the website by itself.

---

**Are you a developer?** The technical details are in [docs/TECHNICAL.md](docs/TECHNICAL.md).
