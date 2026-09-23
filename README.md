# ElliotAI Portal — Finish Setup

✅ Supabase and Netlify are done. Nice work!

Only **3 steps** left. About **15 minutes**.

Keep your notes open. You need:
- `WEBSITE` (your Netlify address, like `https://elliotai-portal.netlify.app`)
- `VAPI SECRET` (the long password you made up for Netlify)

---

## Step 1 — Connect Vapi

We will paste **one link** into Vapi. That's all.

**First, make your link.** Put these 3 pieces together, with no spaces:

```
your WEBSITE  +  /api/vapi-webhook?secret=  +  your VAPI SECRET
```

Example:

```
https://elliotai-portal.netlify.app/api/vapi-webhook?secret=abc123xyz789
```

**Then put it in Vapi:**

1. Open your assistant in Vapi.
2. Find the **Server URL** box.
3. Paste your link.
4. Click **Publish** (or **Save**).

**Also copy the assistant's ID.** It's the long code near the assistant's name at the top. Put it in your notes as `ASSISTANT ID`.

> 🙅 **Skip the "Secret" box** and the **"End of Call Report"** setting. You don't need them. The secret is already in your link, and Vapi sends end-of-call reports by itself.

---

## Step 2 — Add a client

Do this for every new tradie. For now, add **yourself** so you can test.

**A. Send the invite**
1. Go to **Supabase → Authentication → Users**.
2. Click **Add user**, then **Send invitation**.
3. Type the email and click **Invite**.

**B. Add their business**
1. Go to **Supabase → Table Editor → clients**.
2. Click **Insert**, then **Insert row**.
3. Fill in these 4 boxes:

| Box | What to put |
|---|---|
| **user_id** | Click it and pick the email you just invited |
| **business_name** | The business name, like `Acme Roofing` |
| **avg_job_value** | Average job in dollars, numbers only, like `2500` |
| **vapi_assistant_id** | Paste the `ASSISTANT ID` |

Leave every other box alone.

4. Click **Save**. ✅

---

## Step 3 — Test it

1. Open the invite email and click the link.
2. Pick a password. You'll see your dashboard. It's empty, and that's normal.
3. **Call your AI receptionist** and pretend to be a customer.
4. Hang up. Wait about 10 seconds.
5. The call shows up on your dashboard. 🎉 **You're done!**

---

## Didn't work?

| Problem | Try this |
|---|---|
| The call doesn't show up | Check the link in Vapi. It needs `/api/vapi-webhook?secret=` in the middle, and your secret must match Netlify **exactly**. |
| Still no call | Check that **vapi_assistant_id** in Supabase is the same as the ID in Vapi. |
| Your secret has symbols like `&`, `#` or `?` | Change it to letters and numbers only, in **both** Netlify and your Vapi link. Then in Netlify, go to **Deploys → Trigger deploy**. |
| "Your account isn't linked to a business yet" | Redo Step 2B. Make sure you picked the right email in **user_id**. |
| The invite link says "expired" | Click **Forgot password?** on the login page. |

Still stuck? Take a screenshot and send it over.

---

Developer notes: [docs/TECHNICAL.md](docs/TECHNICAL.md)
