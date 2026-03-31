# Powermatix Workforce Portal
## Deployment Instructions

Everything is pre-configured. You only need to do **3 things**:
run the SQL, configure Vercel, and add your Supabase credentials to Azure.

---

## Your Supabase Project (already set up)

```
Project URL : https://hrdkulmzlphkewraafmi.supabase.co
Anon Key    : sb_publishable_xzUWcC8k_OMShmJ_HvxP1g_JoJVyJeH
```

These are already embedded in every HTML file. No manual config needed.

---

## STEP 1 — Run the Database SQL (5 minutes)

1. Go to https://hrdkulmzlphkewraafmi.supabase.co
2. Click **SQL Editor** in the left sidebar
3. Click **New query**
4. Open the file `supabase/SETUP_RUN_THIS.sql`
5. Copy the entire contents → paste into SQL Editor → click **Run**
6. You should see: "Success. No rows returned"

That's it. All 12 tables, all RLS policies, all seed data — done in one shot.

---

## STEP 2 — Push to GitHub & Deploy to Vercel (10 minutes)

1. Create a new **private** GitHub repository called `powermatix-portal`
2. Push all these files to it:
   ```
   powermatix-portal/
   ├── index.html
   ├── tracker/index.html
   ├── attendance/index.html
   ├── auth/callback.html
   ├── vercel.json
   └── supabase/  (for reference only)
   ```
3. Go to https://vercel.com → **Add New Project** → import your GitHub repo
4. No environment variables needed (credentials are in the HTML files)
5. Click **Deploy**
6. Vercel gives you a URL like `https://powermatix-portal.vercel.app`

---

## STEP 3 — Add Your Vercel URL to Azure + Supabase (5 minutes)

### In Azure Portal (portal.azure.com):
1. Search "App registrations" → open **Powermatix Portal**
2. Left menu → **Authentication**
3. Under **Redirect URIs** → click **Add URI**
4. Add: `https://powermatix-portal.vercel.app/auth/callback.html`
5. Save

### In Supabase (hrdkulmzlphkewraafmi.supabase.co):
1. **Authentication → URL Configuration**
2. **Site URL**: `https://powermatix-portal.vercel.app`
3. **Redirect URLs**: add `https://powermatix-portal.vercel.app/auth/callback.html`
4. Save

---

## STEP 4 — First Login & Set Admin Role (2 minutes)

1. Visit `https://powermatix-portal.vercel.app`
2. Click **Sign in with Microsoft** → login with your Azure AD account
3. You'll land on the tracker — it loads all 15 resources and 10 projects from Supabase
4. Now set yourself as admin. In Supabase SQL Editor, run:

```sql
UPDATE profiles
SET role = 'admin'
WHERE email = 'your.email@powermatix.com';
```

---

## File Map

| File | Purpose |
|---|---|
| `index.html` | Login page (Microsoft SSO button) |
| `tracker/index.html` | **Full allocation tracker** — cloud-connected, auto-saves every cell |
| `attendance/index.html` | Mobile check-in / check-out page |
| `auth/callback.html` | Handles OAuth redirect from Azure |
| `vercel.json` | Routing config for Vercel |
| `supabase/SETUP_RUN_THIS.sql` | **Run this once** — sets up entire database |

---

## How Data Flows

```
User on tracker/index.html
  │
  ├─ Changes a cell dropdown
  │     → saveCellToCloud() fires immediately
  │     → UPSERT into tracker_allocations table
  │     → Live "Saving…" → "Saved" indicator in header
  │
  ├─ Types in task notes textarea
  │     → setTask() fires
  │     → 800ms debounce, then saves to tracker_notes table
  │
  ├─ Navigates to next week
  │     → loadWeekFromCloud() fetches that week's rows
  │     → weekData[mon] populated in memory
  │     → renderWeekly() draws the grid
  │
  └─ Opens Monthly KPIs tab
        → Fetches all weeks from tracker_allocations
        → Builds aggregate in memory
        → Renders trend chart + breakdowns
```

---

## Attendance Flow

```
Engineer opens attendance/index.html on phone
  │
  ├─ Taps "Check In"
  │     → INSERT into attendance table (user_id, date, check_in, status)
  │
  ├─ Taps "Check Out"
  │     → UPDATE attendance row (check_out timestamp)
  │
  ├─ Views "My History"
  │     → SELECT last 30 days from attendance for current user
  │
  └─ Submits a correction
        → UPDATE attendance row (is_correction=true, status='pending')
        → INSERT into approval_requests
        → Manager gets notified (Phase 2: email via Supabase Edge Function)
```

---

## Tracker Features (all working)

- ✅ Azure AD SSO — users log in with Microsoft accounts
- ✅ Auto-save — every cell change saves to Supabase instantly
- ✅ Task notes — per resource, per week, debounce-saved
- ✅ Week navigation — ‹ › arrows + year/week dropdowns
- ✅ 2026+ calendar — Monday to Saturday, configurable days
- ✅ Add/remove projects — saved to database immediately
- ✅ Add/remove resources — saved to database immediately
- ✅ Active/inactive toggles — hidden from reports, not deleted
- ✅ Monthly & quarterly KPIs — loads all weeks from database
- ✅ Utilization charts — per resource and per project
- ✅ Shared data — all team members see the same plan
- ✅ Session guard — redirects to login if not authenticated

---

## Troubleshooting

**Blank screen after login**
→ Profile creation may have failed. In Supabase → Authentication → Users, 
check your user exists. Then run:
```sql
INSERT INTO profiles (id, email, full_name, role, is_active)
SELECT id, email, SPLIT_PART(email,'@',1), 'admin', true
FROM auth.users WHERE email = 'your.email@powermatix.com'
ON CONFLICT (id) DO UPDATE SET is_active = true, role = 'admin';
```

**"Failed to load projects" error**
→ SQL wasn't run yet, or RLS blocked the query.
Check Supabase → Table Editor → tracker_projects has rows.

**Azure redirect error "AADSTS50011"**
→ The Vercel URL wasn't added to Azure App Registration redirect URIs.
Follow Step 3 above.

**Tracker shows empty grid**
→ Resources loaded but no allocations for this week yet — that's correct 
for a fresh install. Start assigning projects using the dropdowns.

---

## Phase 2 (coming next)

- Leave management module
- 3-level approval workflow engine  
- Manager dashboard (team view, pending approvals)
- Admin panel (role assignment, user management)
- Email notifications via Supabase Edge Functions
- Attendance export to Excel
