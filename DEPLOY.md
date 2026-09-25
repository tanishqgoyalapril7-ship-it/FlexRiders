# FlexRiders in the cloud

Everything below runs without your laptop.

```
flexriders.in (GoDaddy domain, connected; HTTPS by Vercel / Let's Encrypt)
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
`mobile/eas.json` points preview and production builds straight at the backend, `https://flexriders-api.vercel.app/api/v1` (one hop shorter than going through flexriders.in, and no size limit on photo uploads). Build with `eas build --profile preview` (APK) or `--profile production` (Play Store bundle).

## Domain (GoDaddy → Vercel), connected
`flexriders.in` and `www.flexriders.in` (redirects to flexriders.in) are attached to the `flexriders-landing` project. GoDaddy DNS:

| Type | Name | Value |
|---|---|---|
| A | @ | 216.198.79.1 |
| A | @ | 64.29.17.1 |
| CNAME | www | 66ccd2c4f64c5dfd.vercel-dns-017.com |

Leave GoDaddy's NS, SOA, `_domainconnect` and `_dmarc` records as they are. Optional later: add `admin.flexriders.in` to the same project as a redirect to `https://flexriders.in/admin`.

## Before real riders use it
- Create your own Super Admin (Admin Users → Add Admin, or `backend/create_admin.py`), then remove the old default account `admin@superriders.com` (its password was published in earlier versions of this repo).
- Reset the Supabase database password (it was shared in chat), then update `DATABASE_URL` in `backend/.env`, `backend/.env.mumbai` and the `flexriders-api` project.
- Vercel's Hobby plan is for non-commercial use; move to Pro once FlexRiders is a paying business.

## Test locally in production mode
```bash
cd frontend && npm run build:admin && npm run preview:admin            # dashboard at :5181/admin
cd landing
ADMIN_APP_URL=http://localhost:5181 BACKEND_URL=http://127.0.0.1:8000 npx next build
ADMIN_APP_URL=http://localhost:5181 BACKEND_URL=http://127.0.0.1:8000 npx next start -p 3006
```
