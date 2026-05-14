PowerMatix Attendance Tracking Portal

Production-ready Next.js 15 PWA based on the supplied Figma Make screens.

## Stack

- Next.js 15 App Router, TypeScript, Tailwind CSS 4
- shadcn/ui source components, Lucide Icons, Framer Motion
- Supabase Auth with Microsoft Azure OAuth
- Supabase Postgres relational schema with RLS policies
- Installable PWA manifest and offline shell service worker

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Copy environment variables:

```bash
copy .env.example .env.local
```

3. Add Supabase values to `.env.local`.

4. In Supabase, enable Authentication > Providers > Azure. Add this redirect URL:

```text
http://localhost:3001/auth/callback
```

5. Run the database schema in Supabase SQL editor:

```text
supabase/schema.sql
```

6. Start the app:

```bash
npm run dev
```

Open [http://localhost:3001](http://localhost:3001).

## PWA and Notifications

The portal includes installable PWA support, an offline shell, an install prompt, a service worker, in-app notifications, Supabase Realtime notification updates, browser push subscription storage, and reminder cron endpoints.

Additional environment variables:

```bash
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
CRON_SECRET=
APP_TIMEZONE_OFFSET_MINUTES=300
```

Run the latest `supabase/schema.sql` after pulling updates. It adds:

- `notifications`
- `push_subscriptions`
- `attendance_settings`
- notification and push RLS policies

On Vercel Hobby, high-frequency cron schedules are not allowed, so `vercel.json` does not register the reminder endpoint automatically. Keep `CRON_SECRET` in Vercel and trigger `/api/notifications/reminders` from an external scheduler if you want reminder automation on Hobby. Upgrading to Vercel Pro lets you restore a frequent built-in cron schedule.

For production OAuth, add the production callback to Supabase:

```text
https://your-production-domain.vercel.app/auth/callback
```

Azure App Registration should keep the Supabase callback:

```text
https://tgetcffechhepdwejnva.supabase.co/auth/v1/callback
```

## Modules

- Microsoft sign-in and persistent session shell
- Installable PWA shell with offline navigation fallback
- Notification center with unread badge, mark-as-read, and timestamps
- Attendance reminders for missed check-in/check-out
- Leave approval and admin alert notifications
- Employee check-in/check-out with one attendance record per day
- Leave request form with future-date validation
- Sequential line manager and director approval timeline
- Admin attendance dashboard with date and project filters
- Admin edit modal with remarks and audit metadata
- User management with add/edit/disable and hierarchy assignment
- PWA install support and offline app shell

## Key Files

- App routes: `src/app/**/page.tsx`
- Figma-derived screens: `src/app/pages`
- Shared layout: `src/app/components/Layout.tsx`
- Demo state and client rules: `src/app/context/AppContext.tsx`
- Supabase clients: `src/lib/supabase`
- API route handlers: `src/app/api`
- Database schema: `supabase/schema.sql`
- PWA assets: `public/manifest.webmanifest`, `public/sw.js`
