# ElliotAI: finish setting up (step by step)

Do the steps in order. Every grey box is something you copy and paste.
To copy a box: tap and hold inside it, choose **Select All**, then **Copy**.

---

## Step 1: Turn on deleting calls (Supabase, 2 min)

1. Go to **supabase.com** and log in.
2. Click your project.
3. On the left, click **SQL Editor** (the `>_` icon).
4. Click **+ New query** (top left).
5. Paste this whole box in:

```sql
drop policy if exists "Delete own calls" on public.calls;
create policy "Delete own calls"
  on public.calls for delete to authenticated
  using (client_id in (select public.my_client_ids()));

grant delete on public.calls to authenticated;
```

6. Click **Run** (bottom right).
7. It should say **Success. No rows returned**. ✅

---

## Step 1B: Turn on the automatic texts, reminders and Monday summary (Supabase, 2 min)

1. In **SQL Editor**, click **+ New query**.
2. Paste this whole box in:

```sql
-- ElliotAI Client Portal — automatic follow-ups that keep customers (and tradies) happy.
-- Run AFTER the earlier updates. Safe to run more than once.
--
-- Adds:
--   * A thank-you text to every caller after the call ("we've got your roof repair request…")
--   * A reminder text to customers the afternoon before a booked job
--   * A Monday-morning summary notification for the tradie
--   * On/off switches the tradie can flip in the portal (Settings)

alter table public.clients
  add column if not exists text_callers           boolean not null default true,
  add column if not exists remind_customers       boolean not null default true,
  add column if not exists weekly_summary         boolean not null default true,
  add column if not exists business_phone         text,   -- the number customers can ring back on (shown in texts)
  add column if not exists weekly_summary_sent_on date;

alter table public.calls
  add column if not exists caller_texted_at timestamptz;

alter table public.bookings
  add column if not exists reminder_sent_at timestamptz;

create index if not exists bookings_reminder_idx
  on public.bookings (starts_at)
  where status = 'booked' and reminder_sent_at is null;

-- Tradies can flip their own switches (and nothing else on their business row).
drop policy if exists "Update own settings" on public.clients;
create policy "Update own settings"
  on public.clients for update to authenticated
  using (id in (select public.my_client_ids()))
  with check (id in (select public.my_client_ids()));

revoke update on public.clients from authenticated;
grant update (text_callers, remind_customers, weekly_summary) on public.clients to authenticated;
```

3. Click **Run**. It should say **Success**. ✅
4. **+ New query** again. Put the number customers should ring if they need to change a booking
   (change the number and the business name), then **Run**:

```sql
update public.clients
set business_phone = '0412 345 678'                              -- CHANGE: the number customers can call
where business_name = 'Tysons Tiling & Roofing Specialists'      -- CHANGE: the business name
returning business_name, business_phone;
```

> The texts to customers use your **Twilio** number, so they only go out once Twilio is working
> (see "Later" at the bottom). Everything else in this update works straight away.
> Each tradie can switch the texts on or off themselves in the app: tap the ⚙️ gear (top right).

---

## Step 2: Let each business have its own state and time zone (Supabase, 3 min)

Every business can be in a different state. You pick the **state**, and Supabase sets the right time zone
by itself (including daylight saving). Booking times, "overdue" and alerts all use it.

### 2A: Switch it on (only once, ever)
1. In **SQL Editor**, click **+ New query**.
2. Paste this whole box in:

```sql
-- ElliotAI Client Portal — pick a business's state and its time zone is set for you.
-- Type QLD, NSW, VIC, TAS, ACT, SA, NT or WA in clients.state; clients.timezone fills itself in.
-- Run AFTER the earlier updates. Safe to run more than once.

alter table public.clients add column if not exists state text;

alter table public.clients drop constraint if exists clients_state_check;
alter table public.clients add constraint clients_state_check
  check (state is null or state in ('QLD', 'NSW', 'VIC', 'TAS', 'ACT', 'SA', 'NT', 'WA'));

-- Each state's clock. QLD has no daylight saving; NSW/VIC/TAS/ACT/SA do; NT and WA don't.
create or replace function public.timezone_for_state(p_state text)
returns text
language sql
immutable
as $$
  select case upper(trim(p_state))
    when 'QLD' then 'Australia/Brisbane'
    when 'NSW' then 'Australia/Sydney'
    when 'ACT' then 'Australia/Sydney'
    when 'VIC' then 'Australia/Melbourne'
    when 'TAS' then 'Australia/Hobart'
    when 'SA'  then 'Australia/Adelaide'
    when 'NT'  then 'Australia/Darwin'
    when 'WA'  then 'Australia/Perth'
  end
$$;

-- Tidy the state ("qld " -> "QLD") and set the time zone whenever the state is filled in or changed.
-- A business in an odd spot (e.g. Broken Hill, NSW, runs on Adelaide time) can leave state empty
-- and type its timezone by hand.
create or replace function public.clients_set_timezone()
returns trigger
language plpgsql
as $$
begin
  if new.state is not null then
    new.state := upper(trim(new.state));
    new.timezone := coalesce(public.timezone_for_state(new.state), new.timezone);
  end if;
  return new;
end
$$;

drop trigger if exists clients_set_timezone on public.clients;
create trigger clients_set_timezone
  before insert or update of state on public.clients
  for each row execute function public.clients_set_timezone();

-- Clients already set to a known state's time zone get their state filled in.
update public.clients set state = case timezone
    when 'Australia/Brisbane' then 'QLD'
    when 'Australia/Melbourne' then 'VIC'
    when 'Australia/Hobart' then 'TAS'
    when 'Australia/Adelaide' then 'SA'
    when 'Australia/Darwin' then 'NT'
    when 'Australia/Perth' then 'WA'
  end
where state is null
  and timezone in ('Australia/Brisbane', 'Australia/Melbourne', 'Australia/Hobart', 'Australia/Adelaide', 'Australia/Darwin', 'Australia/Perth');
```

3. Click **Run**. It should say **Success**. ✅

### 2B: Set up a business (do this for each business)
1. Click **+ New query**.
2. Paste the box below.
3. Change the **3 things marked CHANGE**:
   - the **business name**, exactly as it's written in your clients list
   - the **state**: one of `QLD` `NSW` `VIC` `TAS` `ACT` `SA` `NT` `WA`
   - the **opening hours** (24-hour time; write `null` for a closed day, like `"sun":null`)
4. Click **Run**.

```sql
update public.clients
set
  state = 'QLD',                                   -- CHANGE: the state
  callback_urgent_minutes = 60,                    -- urgent: call back within 1 hour
  callback_standard_minutes = 240,                 -- everyone else: within 4 hours
  business_hours = '{"mon":["08:00","17:30"],"tue":["08:00","17:30"],"wed":["08:00","17:30"],"thu":["08:00","17:30"],"fri":["08:00","17:30"],"sat":["09:00","15:00"],"sun":["09:00","15:00"]}'::jsonb   -- CHANGE: opening hours
where business_name = 'Tysons Tiling & Roofing Specialists'   -- CHANGE: the business name
returning business_name, state, timezone;
```

5. You should see **1 row** with the business, its state and its time zone (e.g. **QLD, Australia/Brisbane**). ✅
   - **No rows?** The name didn't match. Run this to see the exact names, then copy one in:
```sql
select business_name, state, timezone from public.clients;
```

> Tip: a business in a spot with its own clock (like Broken Hill in NSW, which runs on Adelaide time)
> can leave **state** empty and set **timezone** by hand, e.g. `timezone = 'Australia/Adelaide'`.

### 2C: Match Elliot's prompt to the state
The first line of each business's Vapi prompt tells Elliot today's date. Change the time zone in it to match:

| State | Put this in the prompt's first line |
|---|---|
| QLD | `Australia/Brisbane` |
| NSW, ACT | `Australia/Sydney` |
| VIC | `Australia/Melbourne` |
| TAS | `Australia/Hobart` |
| SA | `Australia/Adelaide` |
| NT | `Australia/Darwin` |
| WA | `Australia/Perth` |

The prompt in Step 3 is already set to `Australia/Brisbane` for your Queensland test business.

---

## Step 3: Paste in Elliot's new prompt (Vapi, 3 min)

1. Go to **vapi.ai** and log in.
2. On the left, click **Assistants**, then click your assistant.
3. Click the **Model** tab.
4. Click inside the **First Message** box. Delete what's there, then paste this:

```
Hey, I'm Elliot, the virtual assistant for Tysons Tiling and Roofing. Just so you know, this call may be recorded. What can I help you with today?
```

5. Click inside the **System Prompt** box. Delete everything in it (tap inside, **Select All**, delete). Then paste this whole box:

```
[Today] {{"now" | date: "%A %-d %B %Y, %-I:%M %p", "Australia/Brisbane"}} (Brisbane time)

# WHO YOU ARE
You are Elliot, the friendly virtual receptionist for Tysons Tiling & Roofing Specialists in Queensland, Australia. Calm, warm, a little bit Aussie ("no worries"). Short sentences. If asked, say you're an AI. Never pretend to be human.

# YOUR JOB ON EVERY CALL
1. Find out what they need.
2. Get their details.
3. Book a time for the team to come out if they want one. If not, tell them the team will call them back.

# GOLDEN RULES (follow these above everything else)
- Ask ONE question at a time, then stop and wait.
- Never ask a question they've already answered. Never repeat a sentence you already said.
- Read back the phone number once and the address once. Never read anything back twice.
- Before you use a tool, say one short line (like "One sec, just checking the calendar"). After the tool answers, keep talking straight away. Never go quiet.
- If you didn't hear something clearly, ask them to say it again. Never guess.
- Vary your little replies: "Got it", "Right", "Okay", or just move on.

# WHERE WE WORK
We work right across South East Queensland: from the Sunshine Coast down to the Gold Coast and everywhere in between, including Brisbane, Ipswich, Logan, Moreton Bay and Redlands. Never turn a caller away because of where they are. If they're further out, say: "No worries, I'll pop your details through and the team will sort it out with you."

# WHAT WE DO
Roof tiling: new builds, repairs, repointing, restorations, painting, extensions and maintenance. We also clean and paint tin roofs, but we don't do structural repairs on tin roofs (tile only).
If a caller mentions a tin roof, ask once: "Just to check, are you after a clean and paint, or a repair?" If it's a tin repair, say kindly: "We don't do structural repairs on tin roofs, sorry, that's tile only for us. I can still take your details and the team can point you in the right direction."
Hours: Monday to Friday 8am to 5:30pm, weekends 9am to 3pm.
Warranty (only if asked): repairs 10 years, painting 10 years, cleaning 6 months. For more detail, the team will explain on the call back.

# STEP 1: WHAT DO THEY NEED
- If they already said what the job is, don't ask again. Otherwise ask: "What do you need done?"
- Then say one short caring line, like: "Ah, a leak, that's no fun. Let's get it sorted."
- Ask: "Can you tell me a bit more about it?"
- For leaks, damage or repairs, also ask: "How long has it been going on?"

# STEP 2: HOW URGENT
- URGENT: water coming in right now, bad storm damage, or it's unsafe. Say: "That sounds serious. I'll flag it as urgent so the team calls you back within the hour."
- SOMEWHAT URGENT: rain is coming and it could get worse soon, or they really want it done soon. Ask only if it's not clear: "Is there rain coming, or could it get worse quickly?"
- NON-URGENT: everything else (quotes, restorations, maintenance, general questions).
Never make something more urgent than it is.

# STEP 3: THEIR DETAILS (one at a time)
1. "Can I grab your name?"
2. "What's the best number to reach you on?" Read it back once, digit by digit. Wait for yes.
3. "And what's the address?" If a street name is unusual, ask them to spell it. Read the address back once. Wait for yes.

# STEP 4: BOOK A TIME (non-urgent jobs like quotes, inspections and restorations)
Ask: "Would you like me to book a time for the team to come out and take a look?"
- If yes: ask what day suits. Use check_availability for that day (date as YYYY-MM-DD). Offer at most 2 or 3 of the free times it gives you. When they pick one, use book_job with their name, phone, address, a short job description and the start time (YYYY-MM-DDTHH:MM). Then confirm the day and time once.
- If there are no free times that day, offer to check another day.
- If a tool says it can't reach the system, say: "No worries, I'll pass your details on and the team will call you to lock in a time." Then carry on. Don't try the tool again.
- If no, or the job is urgent: don't book. The team will call them back.

# PRICING (only if asked)
"The call-out fee is $100. For restorations it really depends on the roof, but as a rough ballpark it's usually between $5,000 and $15,000. The team needs to see it in person to give you an exact price." Say this once. Never give other numbers. Never haggle.

# PHOTOS
You can't see photos. Tell them they can send photos to the team when the team calls them back.

# OFF-TOPIC CALLS
If it's not about roofs or tiling: "I can only help with roofing and tiling, sorry. Is there anything roof-related I can help with?"

# WRAP-UP
Say: "Got everything I need, [name]." Then say the ONE line that matches:
- Booked: "You're booked in for [day] at [time]. The team will see you then."
- Urgent: "The team will call you back within the hour."
- Everyone else: "The team will call you back within 4 hours."
Then ask: "Is there anything else I can help with?"
- If they ask something, answer it, then ask "Anything else?" again.
- When they say no (or "that's all", "thanks"), say: "Thanks for calling Tysons Tiling and Roofing, have a great day. Bye!" and then use the end call tool.
Never end the call before saying goodbye. Never end it while they're still talking.
```

6. Scroll down and look for **End Call Phrases** (sometimes under the **Advanced** tab). If there's anything in it, delete it so it's empty.
7. Click **Publish** (top right). ✅

---

## Step 4: Check the booking tools (Vapi, 5 min)

Elliot needs 2 tools to book jobs: **check_availability** and **book_job**.

### 4A: Does the tool exist?
1. On the left in Vapi, click **Tools**.
2. Look for **check_availability** and **book_job** in the list.
   - Both there? Go to **4B**.
   - Missing one? Go to **4C** and make it.

### 4B: Check each tool's settings
Click **check_availability** and check these 3 things. Then do the same for **book_job**.

1. **Server URL** must be exactly this (paste it over what's there):

```
https://elliotai-portal.netlify.app/api/vapi-webhook?secret=YOUR-VAPI-SECRET
```

Swap `YOUR-VAPI-SECRET` for your secret (the same as `VAPI_WEBHOOK_SECRET` in Netlify).

2. **Async** must be **OFF** (the switch is grey, not coloured).
3. Click **Save**.

### 4C: Make a missing tool
1. Click **Create Tool**, then choose **Function**.
2. Fill it in using the boxes below for that tool.
3. Server URL: the same link as in 4B.
4. **Async: OFF**.
5. Click **Save**.

**check_availability**

- Tool name:
```
check_availability
```
- Description:
```
Check which start times are free on a given day. Use this before offering the caller any times.
```
- Parameters (if there's a JSON box, paste this):
```json
{
  "type": "object",
  "properties": {
    "date": { "type": "string", "description": "The day to check, written as YYYY-MM-DD, e.g. 2026-09-30" }
  },
  "required": ["date"]
}
```
- Messages, Request start (optional):
```
One sec, just checking the calendar.
```

**book_job**

- Tool name:
```
book_job
```
- Description:
```
Book a time for the team to come out, once the caller has agreed to a specific free time.
```
- Parameters (JSON box):
```json
{
  "type": "object",
  "properties": {
    "name": { "type": "string", "description": "Caller's full name" },
    "phone": { "type": "string", "description": "Best number to call them on" },
    "address": { "type": "string", "description": "Full job address including suburb" },
    "job": { "type": "string", "description": "Short description of the job, e.g. Quote for roof restoration" },
    "start_time": { "type": "string", "description": "Local start time as YYYY-MM-DDTHH:MM, e.g. 2026-09-30T09:00" }
  },
  "required": ["job", "start_time"]
}
```
- Messages, Request start (optional):
```
Righto, just locking that in.
```

### 4D: Add the tools to Elliot
1. Click **Assistants**, then your assistant.
2. Click the **Tools** tab.
3. Make sure these are ticked or added: **check_availability**, **book_job** and **End Call** (hang up).
4. Click **Publish**. ✅

---

## Step 5: Get the new app icon on your phone (2 min)

1. Press and hold the old **ElliotAI** app on your home screen, then tap **Remove App** → **Delete from Home Screen**.
2. Open **Safari** and go to:
```
https://elliotai-portal.netlify.app/dashboard.html
```
3. Log in.
4. Tap **Share** (the square with the arrow), then **Add to Home Screen**, then **Add**.
5. Open ElliotAI from your home screen and tap **Turn on** at the top to switch notifications back on. ✅

---

## Step 6: Test call (5 min)

1. In Vapi, open your assistant and click **Talk** (or call Elliot's number).
2. Say: *"Hi, I'd like someone to come out and quote a roof restoration."*
3. Give a made-up name, number and address.
4. When Elliot asks to book, say yes, and pick a weekday like *"next Tuesday"*.
5. Pick one of the times it offers.

**Then check it worked:**
- Your phone should buzz: **New job booked** (if notifications are on).
- In the app, open **Jobs**. The booking should be there, marked **Booked by Elliot**.
- On **Home**, the call should show under **Calls**.

**If the booking didn't work, send me this line:**
1. Go to **app.netlify.com** and click your site.
2. Click **Logs**, then **Functions**, then **vapi-webhook**.
3. Find the line that starts with `vapi-webhook: tools` and copy it to me.
   - If there is **no** such line, Vapi isn't reaching the portal. Go back to Step 4B and check the Server URL.

---

## Later (before real clients)

- Make a **new Vapi secret** and a **new Supabase secret key** (both were typed into chat). Ask me and I'll walk you through it.
- Sort out the **Twilio** account (needed for backup texts).
- In **Supabase → Table Editor → clients**, fill in **monthly_fee**, **avg_job_value** and **review_url**.
