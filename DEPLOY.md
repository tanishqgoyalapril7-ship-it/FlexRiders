# Going live on flexriders.in

```
flexriders.in               → landing page            (Vercel project 1, root: landing)            
flexriders.in/admin         → admin dashboard         (Vercel project 2, root: frontend)  ─┐ forwarded by
flexriders.in/campaign/...  → public campaign pages   (Vercel project 2)                  ─┤ the landing
flexriders.in/api/v1, /uploads → backend (FastAPI)    (not hosted yet)                    ─┘ project
```

Visitors only ever see `flexriders.in`. The landing project forwards `/admin`, `/campaign`, `/api/v1` and `/uploads` to the other deployments (see `rewrites` in `landing/next.config.ts`), so the dashboard and API share one address and need no CORS setup.

## 0. Before anything: the domain
GoDaddy shows **"pending WHOIS verification"** and **"Registrar Hold"**. Until you click **Validate** and confirm the email GoDaddy sends, the domain won't resolve anywhere. Check the email linked to the GoDaddy account (and spam).

## 1. Admin dashboard (Vercel project 2)
1. vercel.com → sign up with GitHub (the `tanishqgoyalapril7-ship-it` account) → **Add New → Project** → import `FlexRiders`.
2. **Root Directory:** `frontend`. Framework: Vite. Build settings come from `frontend/vercel.json` (`npm run build:admin`, output `dist`).
3. Deploy. Note its address, e.g. `https://flexriders-admin.vercel.app`. (Opening it directly shows a blank root; the app lives at `/admin`.)

## 2. Landing page (Vercel project 1)
1. **Add New → Project** → import `FlexRiders` again.
2. **Root Directory:** `landing`. Framework: Next.js.
3. **Environment variables:**
   | Name | Value |
   |---|---|
   | `ADMIN_APP_URL` | the dashboard address from step 1, e.g. `https://flexriders-admin.vercel.app` |
   | `NEXT_PUBLIC_SITE_URL` | `https://flexriders.in` |
   | `BACKEND_URL` | the backend address, once it is hosted (leave unset until then) |
   | `CONTACT_WEBHOOK_URL` | optional, see the landing README |
4. Deploy.

## 3. Connect the domain (landing project only)
Vercel → landing project → **Settings → Domains** → add `flexriders.in` and `www.flexriders.in`. Vercel shows the DNS records to add. In GoDaddy → **DNS** → add exactly those (typically an **A** record `@` → Vercel's IP and a **CNAME** `www` → `cname.vercel-dns.com`), removing GoDaddy's default "Parked" A record. HTTPS is issued automatically once DNS resolves (minutes to a few hours).

## 4. Backend (not done yet)
Until the backend is hosted and `BACKEND_URL` is set, **flexriders.in works fully, and flexriders.in/admin shows the login screen but can't sign in** (there's no API to reach). Hosting it (a Mumbai server, persistent photo storage, the production `.env`) is the next step. Before it is public:
- set a long random `SECRET_KEY`;
- set `ENABLE_OTP_LOGIN=false` (the development OTP `123456` would let anyone sign in as a rider);
- change the Super Admin's default password (Admin Users → Edit);
- reset the Supabase database password (it was shared in chat).

After it's hosted: set `BACKEND_URL` on the landing project and redeploy it, and build the rider app with `EXPO_PUBLIC_API_URL=https://flexriders.in/api/v1`.

## Test locally in production mode
```bash
cd frontend && npm run build:admin && npm run preview:admin            # dashboard at :5181/admin
cd landing
ADMIN_APP_URL=http://localhost:5181 BACKEND_URL=http://127.0.0.1:8000 npx next build
ADMIN_APP_URL=http://localhost:5181 BACKEND_URL=http://127.0.0.1:8000 npx next start -p 3006
# open http://localhost:3006 → footer "Admin Login" → /admin
```
