# FlexRiders in the cloud

Everything below runs without your laptop.

```
flexriders.in (GoDaddy domain, once connected)
        │
        ▼
Vercel: flexriders-landing  (root: landing/)          https://flexriders-landing.vercel.app
   /                → landing page
   /admin, /campaign/… ─► Vercel: flexriders-admin (root: frontend/)   https://flexriders-admin.vercel.app/admin
   /api/v1, /uploads   ─► Vercel: flexriders-api   (root: backend/, Mumbai bom1)   https://flexriders-api.vercel.app
                                   │
                                   ▼
                        Supabase Mumbai (ap-south-1): database, private photo bucket, pg_cron

Rider app (Android build) ──► https://flexriders-api.vercel.app/api/v1   (mobile/eas.json)
Supabase pg_cron, every minute ──► POST /api/v1/internal/cron/slot-reminders (secret header)
```

The admin dashboard is used at **`<site>/admin`**: the landing project forwards it, and forwards `/api/v1` + `/uploads` to the backend, so the dashboard and API share one address (no CORS needed). Pushing to `main` on GitHub redeploys all three projects.

## Vercel projects and settings

| Project | Root | Settings (Vercel → Project → Settings → Environment Variables) |
|---|---|---|
| `flexriders-landing` | `landing` | `ADMIN_APP_URL=https://flexriders-admin.vercel.app`, `BACKEND_URL=https://flexriders-api.vercel.app`, `NEXT_PUBLIC_SITE_URL=https://flexriders.in` (all public) |
| `flexriders-admin` | `frontend` | none (build settings in `frontend/vercel.json`) |
| `flexriders-api` | `backend` | **server-only secrets:** `DATABASE_URL` (Supabase *transaction pooler*, port 6543), `SECRET_KEY`, `CRON_SECRET`, `SUPABASE_SECRET_KEY`. Other: `SUPABASE_URL`, `STORAGE_BUCKET=uploads`, `ENABLE_OTP_LOGIN=false`, `PROJECT_NAME`. Optional: `CORS_ORIGINS` (only for a dashboard on another domain). Vercel sets `VERCEL=1`, which switches off startup migrations and the local reminder thread. |

Secrets never go into the landing page, the dashboard or the app. Local copies live in `backend/.env` / `backend/.env.mumbai` (git-ignored).

## Supabase (Mumbai project)
- **Database:** the backend is the only client; every table has RLS on with no policies, so the public REST API can't read anything.
- **Photos:** private bucket `uploads`. The database keeps `/uploads/<path>`; the backend answers `/uploads/<path>` with a 1-hour signed link. Proof photos are stored under `campaign-proofs/<campaign>/<rider>/<random>.jpg` (random names so a retake never overwrites the rejected photo's history; duplicates are caught by content hash).
- **Reminders:** `pg_cron` job `flexriders-slot-reminders` runs every minute and calls the backend with the `CRON_SECRET` header via `pg_net`. Check runs in `cron.job_run_details` and responses in `net._http_response`. Reminders are de-duplicated in the database, so extra runs never send twice.

## Rider app
`mobile/eas.json` points preview and production builds at `https://flexriders-api.vercel.app/api/v1`. Build with `eas build --profile preview` (APK) or `--profile production` (Play Store bundle). Once flexriders.in is connected you can switch it to `https://flexriders.in/api/v1`.

## Connecting flexriders.in (GoDaddy)
1. GoDaddy → flexriders.in → **Validate** the WHOIS banner and confirm the email. Until then the domain is on *clientHold* and can't be used.
2. Vercel → `flexriders-landing` → **Settings → Domains** → add `flexriders.in` and `www.flexriders.in`.
3. GoDaddy → **DNS**: remove the "Parked" `A` record and add exactly the records Vercel shows.
4. Optional: add `admin.flexriders.in` to the same project as a redirect to `https://flexriders.in/admin`.

## Before real riders use it
- Change the Super Admin's default password (Admin Users → Edit).
- Reset the Supabase database password (it was shared in chat), then update `DATABASE_URL` in `backend/.env`, `backend/.env.mumbai` and the `flexriders-api` project.
- Vercel's Hobby plan is for non-commercial use; move to Pro once FlexRiders is a paying business.

## Test locally in production mode
```bash
cd frontend && npm run build:admin && npm run preview:admin            # dashboard at :5181/admin
cd landing
ADMIN_APP_URL=http://localhost:5181 BACKEND_URL=http://127.0.0.1:8000 npx next build
ADMIN_APP_URL=http://localhost:5181 BACKEND_URL=http://127.0.0.1:8000 npx next start -p 3006
```
