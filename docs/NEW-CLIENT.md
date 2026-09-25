# Setting up a new client (do this for every new business)

About **30 minutes** per client. Do the steps in order and tick them off as you go.

---

## What's the same for everyone, and what's different

**Set up once, shared by every client (you've already done these):**

- The website (Netlify) and the database (Supabase), including all the SQL updates
- The Vapi tools **check_availability** and **book_job**
- The Server URL and secret: `https://elliotai-portal.netlify.app/api/vapi-webhook?secret=YOUR-VAPI-SECRET`
  (swap `YOUR-VAPI-SECRET` for your secret, the same as `VAPI_WEBHOOK_SECRET` in Netlify; never put the real one in these guides)

**Different for every client (this guide):**

| Thing | Where it lives |
|---|---|
| Their login (email + password) | They make it themselves (Step 2), and it links up by itself |
| Business name, state/time zone, hours, prices, trade | Owner page (Step 4) + Elliot's prompt (Step 3) |
| Their own Elliot (Vapi assistant) with their own script | Vapi → Assistants (Step 3) |
| Their own phone number for Elliot | Vapi → Phone Numbers (Step 3) |
| Their mobile for alerts, and the number customers ring back on | Owner page (Step 4) |

---

## Step 1: Get their answers (send them this, 5 min)

Copy this message and text or email it to the client:

```
Hi! To set up Elliot, your AI receptionist, I just need a few quick answers:

1. Business name (exactly how you want Elliot to say it):
2. Your email (for logging in to the app):
3. Your mobile (for job alerts):
4. The number customers should ring if they need to change a booking:
5. What state are you in?
6. Where do you work? (suburbs / areas):
7. Opening hours for each day (and which days you're closed):
8. What jobs do you do?
9. Any jobs you DON'T do?
10. What counts as urgent for you? (e.g. no power, water pouring out):
11. How fast will you call back? Urgent: ___  Everything else: ___
12. What should Elliot say if someone asks about price? (call-out fee etc.):
13. Roughly what's your average job worth? ($):
14. Your Google review link (if you have one):
15. Anything else Elliot should know? (warranty, licences, emergency call-outs):
```

Keep their answers open. You'll copy from them in every step below.

---

## Step 2: They make their login (2 min)

1. Send the client this link:
```
https://elliotai-portal.netlify.app/signup.html
```
2. They type **the same email as their answer #2**, pick a password and tap **Create account**.
3. They'll see **"Almost there"**. That's right. It changes once you finish Step 4.

---

## Step 3: Their own Elliot in Vapi (15 min)

### 3A: Copy your working Elliot
1. Go to **vapi.ai**, then **Assistants** on the left.
2. Find your test Elliot, click the **⋯** (three dots) next to it, and click **Duplicate**.
   - No Duplicate option? Click **Create Assistant**, then also do the **Structured Outputs** step in README Part 10, Step C.
3. Rename the copy to the client's business name (click the name at the top).

### 3B: Their script
1. Open **[docs/prompt-template.md](prompt-template.md)** and copy the big box into your notes app.
2. Fill in every **[[BLANK]]** using their answers. Use the time zone table at the bottom of that file.
3. In Vapi, on the new assistant, click the **Model** tab.
4. **System Prompt:** delete what's there and paste your filled-in prompt.
5. **First Message:** paste the first message from the template, with their business name in it.

### 3C: Check the connections (these copy over, but check)
1. **Server URL** (on the **Advanced** tab) must be:
```
https://elliotai-portal.netlify.app/api/vapi-webhook?secret=YOUR-VAPI-SECRET
```
2. **Tools** tab: **check_availability**, **book_job** and **End Call** are all there.
3. **Analysis** tab: **Structured Outputs** (or Structured Data) is on, with the fields name, callback_number, address, issue, details, urgency, job_type.
4. Click **Publish**.

### 3D: Copy the assistant's ID
1. At the top of the assistant, find its **ID** (a long code like `3f2a9c1e-…`). Click it to copy.
2. Paste it into your notes. You need it in Step 4.

### 3E: Give Elliot a phone number
1. In Vapi, click **Phone Numbers** on the left.
2. Add an Australian number (**Buy Number** if it offers one, or **Import** a number from Twilio).
3. Open the number and set **Assistant** to the client's new Elliot. **Save**.
4. Write the number down. The client needs it in Step 6.

---

## Step 4: Add them on your owner page (2 min)

1. Open **https://elliotai-portal.netlify.app/owner.html** and tap **+ Add a client**.
2. Fill it in from their answers:
   - business name, login email, state
   - their mobile, opening hours and call-back times
   - your monthly fee and their average job value
   - the **Vapi assistant ID** from Step 3D
3. Tap **Save client**.
   - It tells you if anything is missing or wrong.
   - Their **state sets their time zone** by itself.
   - Their **login links up by itself**, whether they signed up already (Step 2) or sign up later.
4. Their card appears in your list. The dot turns green after their first call.

<details>
<summary>Owner page not set up yet? Use the Supabase paste instead</summary>

In **Supabase → SQL Editor → + New query**, paste this, change every line marked CHANGE, then click **Run**:

```sql
insert into public.clients (
  user_id, owner_email, business_name, state, business_hours,
  callback_urgent_minutes, callback_standard_minutes,
  avg_job_value, monthly_fee, alert_phone, business_phone,
  review_url, vapi_assistant_id
)
select
  (select id from auth.users where lower(email) = lower('owner@smithplumbing.com.au')),  -- CHANGE: their login email
  'owner@smithplumbing.com.au',      -- CHANGE: the same email again
  'Smith Plumbing',                  -- CHANGE: business name
  'WA',                              -- CHANGE: state: QLD NSW VIC TAS ACT SA NT WA
  '{"mon":["07:00","17:00"],"tue":["07:00","17:00"],"wed":["07:00","17:00"],"thu":["07:00","17:00"],"fri":["07:00","17:00"],"sat":["08:00","12:00"],"sun":null}'::jsonb,
                                     -- CHANGE: hours, 24-hour time, null = closed
  60,                                -- CHANGE: urgent call-back in minutes
  240,                               -- CHANGE: everyone else, in minutes
  2500,                              -- CHANGE: average job value in $
  1000,                              -- CHANGE: your monthly fee in $
  '0412 345 678',                    -- CHANGE: their mobile, for alerts
  null,                              -- number customers ring back on, or null to use their mobile
  null,                              -- Google review link in quotes, or null
  'PASTE-ASSISTANT-ID-HERE'          -- CHANGE: the Vapi assistant ID from Step 3D
returning business_name, state, timezone;
```
</details>

---

## Step 5: Test it yourself (5 min)

1. Ring the client's new Elliot number.
2. Pretend to be a customer and ask to book a quote.
3. Check:
   - [ ] Elliot says the right business name, area and prices
   - [ ] The booking shows in the client's app under **Jobs** (log in as them, or ask them to look)
   - [ ] The call shows under **Calls** with the right job name
4. Delete the test call afterwards: **Calls → Delete**, tick it, tap **Delete**.

---

## Step 6: Hand it over to the client (send them this)

```
You're all set! Here's how to get started:

1. Open this on your phone: https://elliotai-portal.netlify.app
   (iPhone: use Safari. Android: use Chrome.)
2. Log in with the email and password you made.
3. Add it to your home screen:
   iPhone: tap Share (square with arrow) > Add to Home Screen
   Android: tap the menu (3 dots) > Add to Home screen
4. Open ElliotAI from your home screen and tap "Turn on" for notifications.
5. Send your calls to Elliot when you can't answer. On your mobile, dial this and press call:
   **004*[ELLIOT NUMBER]#
   (To turn it off later, dial ##004# and press call.)

Every call Elliot takes will buzz your phone. Tap it to see who called and what they need.
```

Before sending, swap **[ELLIOT NUMBER]** for their Elliot number from Step 3E, written with no spaces, like `**004*0731234567#`.
This forwards calls when they're busy, don't answer, or have no signal. It works on most Australian mobiles.
If it doesn't work on theirs, they can ask their phone company for "conditional call forwarding".

---

## Step 7: Get paid (1 min)

1. On your owner page, tap **Payment link** on their card.
2. Tap **Copy link** and text or email it to them.
3. Once they pay, their card shows **Paid**. Stripe charges them every month after that.
   - If a payment fails, you get an alert.
   - They can change their card themselves under **⚙️ → Payment details** in their app.

---

## Quick checklist (tick for each client)

- [ ] 1. Sent the questions and got their answers
- [ ] 2. They made their login
- [ ] 3. Duplicated Elliot, pasted their filled-in script, checked tools and Server URL, published
- [ ] 3. Copied the assistant ID and gave Elliot a phone number
- [ ] 4. Added them on the owner page
- [ ] 5. Made a test call and a test booking
- [ ] 6. Sent the welcome message; they added the app and turned on notifications
- [ ] 7. Sent the payment link and they show as Paid
