# Super Riders — Rider Management & Brand Campaign Platform

Super Riders manages delivery riders end to end: registration and verification, brand assignment, paid brand campaigns tracked through daily photo proof, T-shirt / brand-kit pickup, payouts, and the admin tooling around all of it.

It has three parts that share one backend:

| Part | Stack | Folder |
|---|---|---|
| **Backend API** | FastAPI, SQLAlchemy 2, Pydantic v2, PostgreSQL (Supabase) or SQLite | `backend/` |
| **Admin dashboard** (web) | React 18, Vite 5, lucide-react | `frontend/` |
| **Rider app** (iOS & Android) | React Native 0.74, Expo SDK 51 | `mobile/` |

---

## Contents

- [Quick start](#quick-start)
- [Rider app features](#rider-app-features)
- [Admin dashboard features](#admin-dashboard-features)
- [Campaigns in depth](#campaigns-in-depth)
- [Data safety: delete, archive, reset](#data-safety-delete-archive-reset)
- [Security](#security)
- [Configuration](#configuration)
- [API overview](#api-overview)
- [Project structure](#project-structure)
- [Testing](#testing)
- [Known limitations](#known-limitations)

---

## Quick start

### Prerequisites
- Python 3.9+
- Node.js 18+
- For the rider app: Xcode (iOS Simulator) or Android Studio, or the Expo Go app on a phone

### 1. Backend (port 8000)

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # then edit .env (see Configuration)
python reset_clean_db.py        # creates tables + the 3 admin accounts (no demo data)
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

- Health check: http://127.0.0.1:8000/health
- Interactive API docs: http://127.0.0.1:8000/docs
- Tables and new columns are created automatically at startup. On PostgreSQL, row-level security is enabled on every table so Supabase's public REST API can't read the data; the backend keeps full access.

### 2. Admin dashboard (port 5173)

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 and sign in. `reset_clean_db.py` creates these accounts:

| Role | Phone | Password |
|---|---|---|
| Super Admin | `+919999999999` | `admin123` |
| Operations Admin | `+919999999998` | `ops123` |
| Finance Admin | `+919999999997` | `finance123` |

> **Change these passwords** (Admins page → Edit) before using the system with real data.

### 3. Rider app

```bash
cd mobile
npm install
npx expo start          # press i for the iOS Simulator, a for Android
```

The app talks to `http://127.0.0.1:8000/api/v1` on the iOS Simulator and `http://10.0.2.2:8000/api/v1` on the Android emulator. On a real phone, point it at your computer's Wi-Fi IP:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.20:8000/api/v1 npx expo start
```

(For a phone, also start the backend with `--host 0.0.0.0`.)

### Optional: demo data
`python seed_data.py --demo` fills a **local SQLite** database with sample riders and brands. It refuses to run against PostgreSQL so demo data never reaches a real database.

---

## Rider app features

### Account
- **Registration wizard** (Personal → Work → Vehicle & Location → Payment → Review):
  - Show/hide toggle on the password field.
  - Date of birth picker with Day / Month / Year lists (riders must be 18+).
  - Type-ahead suggestions for **city** (~90 Indian cities), **area** (popular areas in the major cities) and **vehicle model**. The lists are bundled in the app, so nothing typed is sent to a third party; any value can still be typed.
  - **Vehicle number** with live validation of Indian formats (`HR 26 DK 8337`, `DL 3C 1234`, Bharat series `22 BH 1234 AA`). It's stored normalised (`HR26DK8337`) and must be unique.
  - Each rider gets a sequential Rider ID (`SR-000001`, `SR-000002`, …).
- **Login** with mobile number + password (with show/hide), or OTP (development code; see limitations).
- **Status-aware Home screen**: application under review → approved → brand assigned → campaign active → campaign completed, each with a tailored banner.

### Home
- Greeting and location, notification bell with an unread dot.
- **Brand card** (current brand, assignment date, current campaign, account status, today's earnings, pending payout).
- **My Campaign** card with today's photos (x/3), streak, photo-days vs target and earnings.
- Quick actions (My Brand, Earnings, Payments, Documents, Support, Campaigns) and Recent Activity.

### Campaigns
- **Available / My Campaign / History** tabs.
- **Join flow**: if the campaign needs a T-shirt, the rider picks a size (and a pickup location when there are several). A popup explains that the T-shirt must be collected before the campaign starts, with **Continue / Cancel**. Joining only creates a request; the rider isn't a campaign rider yet.
- **Request status**: *Application Submitted*, T-shirt *Pending Collection / Collected*, Campaign *Waiting for Admin Approval*, and the pickup location's address, dates, hours, contact, instructions, plus **Open Map** and **Call** buttons. A rejected request shows *Application Rejected* with the reason.
- **Daily photo proof (Photo Streaks)**:
  - 3 different approved photos on a day = 1 completed day = 1 delivered rider-day.
  - The Today's Photos card has 3 slots showing each photo as approved, in review or rejected, and an "Upload Photo 2 of 3" button.
  - Current streak, longest streak, total photo-days and a "streak broken" warning.
  - Target days vs completed, completion %, missed and excused days.
  - A day-by-day timeline (x/3 photos per day, surplus days shown as "target reached, not paid").
- **T-Shirt / Brand Kit Pickup card** with size, status, location, map and call buttons.
- A "Campaign target reached" banner when the brand's commitment is fully delivered.

### Money
- Earnings summary and payment history.

### Notifications
- Filter (All / Unread / Payments / System), mark all read, delete one, delete all.

### Profile
- Profile card (name, Rider ID, status), Light / Dark / System theme.
- Personal details. The rider can edit or remove date of birth, vehicle model, area, UPI ID and GPay number. Name, mobile, vehicle number and city are verified fields that only operations can change.
- Account status card (verified / under review / suspended, with the reason).
- **Delete account**: password + typing DELETE. A rider with no history is removed completely; a rider with payments or campaign history is deactivated instead, so payout records are kept. It's blocked while the rider is in an active campaign.

### Reliability
- Background refresh every 4 s that never overlaps itself (a slow backend can't pile up requests), plus 20-second request timeouts (60 s for photo uploads).

---

## Admin dashboard features

Sign-in is required. The session is stored in the browser, and an expired session returns to the login screen.

### Dashboard
- KPIs, 7-day registrations, payment chart, brand distribution, campaign overview, pending approvals.
- Monthly payments with real month-over-month change.

### Riders
- Status tabs: All, Pending, Approved, Active, Suspended, Rejected, **Archived**. Search by name, ID, phone, vehicle number, email or UPI; filter by city.
- **Create rider** (sets their app login), **edit rider** (changing the mobile number changes their login; vehicle number is validated and unique).
- Approve, reject (with a reason), suspend (with a reason), reactivate.
- Assign or end a **brand** assignment; **add to a campaign** directly.
- **Delete / Archive / Restore** (see [Data safety](#data-safety-delete-archive-reset)).

### Brands
- Create, edit, activate or deactivate, search and filter, detail view with assignment history.
- Delete: shows linked campaigns and riders first; brands with history can only be deactivated.

### Campaigns
- Create / edit wizard: Basics → Slots & Payout → **T-Shirt & Pickup** → Details. It includes the brand contract value (with a per-rider-day helper), whether surplus days are paid, and whether riders continue after fulfilment.
- **Publish / Unpublish / Pause / Resume / Complete / Cancel / Delete**. Drafts are clearly marked "Hidden from riders".
- A **rider visibility banner** on each campaign says whether riders can see it (and why not), how many slots are left, and why individual riders can't join.
- Campaign detail tabs:
  - **Delivery**: contracted vs delivered rider-days, fulfilment %, expected-vs-actual chart, pace status, recovery plan (projected shortfall, replacement riders, extension days, each with its formula), active and at-risk riders.
  - **Riders**: today's photos (x/3), current and longest streak, photo-days, target, remaining, completion %, Active / At Risk / Inactive, earnings, "Replaces …". Add a rider directly, remove a rider, open the activity view.
  - **Requests**: see *Join Requests* below.
  - **Photos**: review each photo individually (approve, or reject with a reason). Each photo shows how many valid photos its day has.
  - **Payouts**: approve and pay rider payouts (recorded in the payments ledger).
  - **Extensions**: approve dated extensions to recover a shortfall.
  - **Brand Kit**: T-shirt requirement, size-wise counts, pickup locations, per-rider size / location / status / pickup date / collected date.
  - **Financials**: brand contract value, received / refunds / credits, payment status, rider payout totals, platform margin, overpayment adjustments (mark Recovered or Waived).
  - **History**: every rider-day change (who, when, old → new, why) and the final summary saved at closure.
- CSV export per campaign.

### Join Requests
- Sidebar page with pending requests across all campaigns (filters: Pending, Approved, Rejected, All, by campaign), plus the same table in each campaign's Requests tab.
- **Mark T-shirt Collected** (records the size handed over; can be undone), **Approve** (disabled with the reason until allowed), **Reject** (reason required).

### Payments
- Create, mark paid, mark failed, retry. **Edit** or **cancel** pending payments; paid payments are locked. CSV export.

### Notifications, Audit Log, Reports
- Notifications: mark read, delete one, delete read, delete all.
- Audit log of every admin action.
- Riders and payments CSV exports.

### Admins & Settings
- **Admin accounts**: add, edit role or password, deactivate. You can't lock yourself out, and there is always at least one active super admin. Accounts are never deleted, because the audit log refers to them.
- **Settings**: the operating rules currently in effect (read-only), and **Reset Data** (super admin only; see below).

UX conventions: every destructive action uses a confirmation dialog that shows linked records, needs a reason or a typed confirmation, and shows loading and errors inside the dialog. Results appear as toast messages; there are no browser alert pop-ups.

---

## Campaigns in depth

### Purchased vs delivered vs earned vs paid
Four figures are kept strictly separate:

1. **Purchased**: contracted rider-days `C = required riders × contract days`, fixed at publish.
2. **Delivered**: completed rider-days on contract or extension dates, one per rider per date. Days are counted in date order; days that were already paid always stay inside the contract.
3. **Earned**: payable days × each rider's daily rate. Days beyond `C` are *surplus*, unpaid unless "Allow payout beyond contract" is on.
4. **Brand money**: contract value plus explicit Received / Refund / Credit records. A delivery shortfall never changes billing automatically.

### Photo Streaks
- A day completes only with **3 distinct approved photos** (`PHOTOS_PER_DAY`). Duplicate images (same file hash) are rejected at upload and never counted twice; extra photos never create extra days.
- Streaks follow the **photo date**, not the approval time. Today stays open until it completes, days awaiting review don't break a streak, and excused days neither break nor extend it.
- Rejecting a photo that was already approved needs a reason, recalculates payouts, logs the change and, if the rider was already paid, creates an **overpayment adjustment**. Nothing is deducted automatically.

### Pace, recovery and extensions
- Status: *On Track* (≥ 95 % of expected), *At Risk* (≥ 80 %), *Behind Target* (< 80 %), plus *Fulfilled*, *Extended*, *Completed with Shortfall*. With little data (fewer than 3 days or 20 rider-days), 100 % attendance is assumed and the plan is labelled *Preliminary*.
- Replacement riders = `ceil(shortfall ÷ days remaining)`, not one per missed day. Extension days = `ceil(shortfall ÷ (riders × attendance))`.
- Extensions and replacement slots never change `C`.

### Join → approval flow
```
Rider joins (size + pickup location) ─► request: T-shirt "Pending Collection", campaign "Pending Admin Approval"
        │
        ▼
Rider collects the T-shirt ─► admin marks it Collected
        │
        ▼
Admin approves ─► checks: rider eligible, campaign published, no conflicting campaign,
                  T-shirt collected (if required), slot available
        │
        ▼
Rider becomes an official campaign rider ─► campaign appears under My Active Campaign
```
A join request is **never** an active campaign rider.

### What riders see
A campaign is visible in the rider app when it is **published**, not completed or cancelled, and hasn't ended (including extensions). A rider's approval status, brand or current campaign never hides a campaign; they only decide whether the rider can join. Set `CAMPAIGN_VISIBILITY_LOG=true` to log the reason each campaign is hidden.

### T-shirt / brand-kit pickup
- Admins configure one or more **pickup locations** per campaign: name, address, Google Maps link, available dates and days, start and end time, contact person and phone, instructions. Locations can be activated or deactivated; one that riders were given can't be deleted.
- With several active locations, the rider chooses one when joining; with one, it's assigned automatically. Riders can't change it afterwards; admins can.
- Not required at all when the campaign has no T-shirt.

---

## Data safety: delete, archive, reset

| Record | Permanently deleted only when… | Otherwise |
|---|---|---|
| Rider | no payments, brand, campaign or photo history | **Archived**: hidden, login disabled, current brand and campaign ended, history kept, restorable |
| Brand | no campaigns, assignments or payments | **Deactivated** |
| Campaign | draft or cancelled, with no riders, activity, paid payouts or brand-payment records | **Cancelled** |
| Pickup location | no rider or request uses it | **Deactivated** |
| Payment | never | Cancelled (pending or failed only) |
| Admin account | never | Deactivated |
| Notification | always deletable | — |

**Reset Data** (Settings, super admin only, type `RESET` to confirm). The dialog shows the exact number of records each option will delete:
- *Campaign activity & photos*, *Campaigns*, *Brands* (includes their campaigns), *Riders*, or *All application data*.
- Admin accounts, the audit log, the database structure and configuration are **never** touched, and every reset is written to the audit log.

---

## Security
- JWT authentication; admin routes require an admin role, and riders get `403` on every admin endpoint.
- Admin accounts can **never** log in with OTP; deactivated or archived accounts can't log in.
- Notifications are scoped to their owner.
- On Supabase, row-level security is enabled on all tables (no public REST access).
- Rider photo uploads: image type and size are checked, and a SHA-256 hash is used for duplicate detection.
- `backend/.env` holds the database password and is gitignored. Never commit it.

---

## Configuration

`backend/.env` (see `backend/.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | local SQLite file | PostgreSQL / Supabase URL (URL-encode `@` in passwords as `%40`) |
| `SECRET_KEY` | dev value | JWT signing key: **set a long random value** |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `1440` | Login session length |
| `MOCK_OTP_CODE` | `123456` | Development OTP (riders only) |
| `PHOTOS_PER_DAY` | `3` | Distinct approved photos for a completed day |
| `FULFILLMENT_ON_TRACK_PCT` / `FULFILLMENT_AT_RISK_PCT` | `95` / `80` | Campaign pace thresholds |
| `LOW_SAMPLE_MIN_DAYS` / `LOW_SAMPLE_MIN_RIDER_DAYS` | `3` / `20` | "Preliminary" plan threshold |
| `RIDER_BEHIND_PCT` / `INACTIVE_MISSED_DAYS` | `80` / `3` | Rider At Risk / Inactive rules |
| `CAMPAIGN_VISIBILITY_LOG` | `false` | Log rider-app campaign visibility decisions |

**Supabase notes:** the session pooler allows 15 connections. The backend uses at most 8 and waits at most 10 s for one. Use the pooler host (the direct host is IPv6-only).

---

## API overview

Base path `/api/v1`. Full, interactive reference at `/docs`.

| Area | Main endpoints |
|---|---|
| Auth | `POST /auth/login`, `/auth/otp/send`, `/auth/otp/verify`, `/auth/register`, `GET /auth/me` |
| Rider (self) | `GET/PATCH/DELETE /riders/me`, `GET /riders/me/payments` |
| Rider campaigns | `GET /riders/me/campaigns`, `GET /riders/me/campaigns/{id}`, `POST …/{id}/join`, `…/{id}/withdraw`, `…/{id}/activity` (photo upload) |
| Admin riders | `GET/POST /admin/riders`, `GET/PUT/DELETE /admin/riders/{id}`, `…/delete-impact`, `…/archive`, `…/restore`, `…/approve`, `…/reject`, `…/suspend`, `…/reactivate` |
| Brands | `GET/POST /brands`, `GET/PUT/DELETE /brands/{id}`, `…/delete-impact`, `POST /brands/assign/{rider_id}`, `DELETE /brands/unassign/{rider_id}` |
| Campaigns | CRUD, `…/{publish,unpublish,pause,resume,complete,cancel}`, `…/fulfillment`, `…/rider-visibility`, `…/riders`, `…/photos`, `…/payouts`, `…/extensions`, `…/brand-payments`, `…/adjustments`, `…/brand-kit`, `…/pickup-locations`, `…/activity-log`, `…/snapshot`, `…/export` |
| Join requests | `GET /campaigns/join-requests`, `GET /campaigns/{id}/applications`, `POST …/applications/{id}/{kit,approve,reject}` |
| Payments | `GET/POST /payments`, `PUT /payments/{id}`, `POST …/{id}/process`, `…/{id}/cancel` |
| Notifications | `GET /notifications`, `PATCH …/{id}/read`, `PATCH …/read-all`, `DELETE …/{id}`, `DELETE /notifications` |
| Admin system | `GET/POST /admin/users`, `PUT/DELETE /admin/users/{id}`, `GET /admin/system/settings`, `GET /admin/system/reset-preview`, `POST /admin/system/reset` |
| Reports | `GET /reports/dashboard`, `/reports/export/riders`, `/reports/export/payments`, `GET /audit-logs` |

---

## Project structure

```
backend/
  app/
    api/v1/endpoints/   auth, riders, admin_riders, brands, campaigns, payments,
                        notifications, reports, audit_logs, admin_system
    models/             all_models.py (users, riders, brands, payments…), campaign_models.py
    schemas/            Pydantic request/response models
    services/           campaign_service (rules), fulfillment_service (rider-days, recovery),
                        kit_service (T-shirt pickup), data_admin_service (delete/archive/reset),
                        rider_service, payment_service, notification_service, audit_service
    core/               config, database (pool, startup migrations, RLS), security
  tests/                pytest suite (runs on SQLite, never touches Supabase)
  reset_clean_db.py     tables + admin accounts, no demo data
  seed_data.py          demo data (SQLite only, needs --demo)
frontend/src/
  views/                Dashboard, Riders, Brands, Campaigns, CampaignDetail, Payments,
                        Reports, AuditLogs, AdminPages (Login, Admins, Settings, Notifications)
  components/           CampaignFulfillment, BrandKitEditor, JoinRequests, AdminCrud,
                        Feedback (toasts + danger dialog), modals, charts
  services/api.js       API client
mobile/
  App.js                navigation, session, background refresh
  src/screens/          Splash, Login, Register, Home, Campaigns, CampaignDetail, Earnings,
                        Payments, Brand, Notifications, Profile, Support
  src/components/       ui, formFields, KitPickup, ConfirmSheet
  src/data/             city, area and vehicle suggestions
  src/services/api.js   API client (timeouts)
docs/                   earlier architecture, deployment and store guides (this README is the current reference)
```

---

## Testing

```bash
cd backend
source venv/bin/activate
python -m pytest -q          # 68 tests
```

The suite always uses a throwaway SQLite database. It covers:
- registration and vehicle numbers;
- brands;
- the campaign lifecycle and fulfilment worked examples (e.g. 300 → 245 delivered = 81.67 %, replacement and extension maths);
- photo streaks;
- corrections and overpayments;
- brand money;
- the T-shirt pickup and join-request flow;
- rider visibility;
- CRUD, archive and permission rules;
- data reset.

Build checks:
```bash
cd frontend && npm run build
cd mobile && npx expo start    # then open the iOS/Android bundle; Metro reports any compile error
```

---

## Known limitations
- **OTP login** uses a fixed development code, and there is no SMS provider. It is disabled for admin accounts, but a real SMS/OTP service is needed before production.
- **No payment gateway**: "Mark Paid" records a payment made outside the app.
- **Rider documents** (licence, Aadhaar, RC) are verified offline; in-app document upload isn't built yet.
- **Profile photo upload, Terms & Conditions and Privacy Policy** pages aren't built yet.
- The rider app's **Support** screen is informational ("coming soon").
- **Operating rules** are set in `backend/.env`, not from the dashboard.
- **Performance**: the dashboard refreshes every 3 s. With Supabase in a distant region each query takes about 160 ms, so a nearer region or Supabase's transaction pooler is recommended as data grows.

---

## License
MIT: see [LICENSE](LICENSE).
