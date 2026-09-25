# FlexRiders Rider App — Google Play release pack

Everything Play Console asks for, based on what the app and backend actually do (audited 26 Sep 2026).
Items marked **[YOU]** need the business owner's input or a Play Console action.

## 1. App identity

| Item | Value |
|---|---|
| App name | FlexRiders |
| Package name (permanent) | `in.flexriders.rider` |
| Version | 1.0.0 (versionCode 1) |
| Target / compile SDK | 36 (Android 16) · min SDK 24 |
| Build | Expo SDK 54 · React Native 0.81.5 · Hermes |
| App icon | `mobile/assets/play-store-icon-512.png` (512×512) |
| Feature graphic | `mobile/assets/play-feature-graphic.png` (1024×500) |
| Category | Business (alternative: Auto & Vehicles) |
| Ads | The app contains **no ads** |
| Price | Free |
| Countries | India (riders and campaigns are in India) |
| Target audience | 18+ only. Note: date of birth is optional; the app refuses a date of birth under 18 when one is entered, but doesn't force riders to give one |

**Upload key:** `~/FlexRiders-signing/` on the build Mac (keystore + `signing.properties`). **[YOU]** Back this folder up
(password manager / encrypted drive). Enrol in **Play App Signing** (default for new apps): Google holds the app signing key;
this is only the upload key and can be reset through Play support if lost.

## 2. Store listing text (no claims beyond what the app does)

**Short description (≤80):**
Join FlexRiders brand campaigns, submit daily ride photos and track your earnings.

**Full description:**
FlexRiders is the rider app for the FlexRiders advertising programme.

• Register as a rider with your vehicle: Cycle, Bike / Two Wheeler, Auto or Three Wheeler
• Browse campaigns open to your vehicle type and request to join
• Read and accept each campaign's terms before joining
• Collect your campaign T-shirt / brand kit from a pickup point
• Take your Morning, Evening and Night campaign photos with the camera
• Build your photo streak and see which days are approved
• Record your campaign route while you ride (optional, only when you tap Start Route)
• Track your earnings, payouts and payment history
• Refer friends with your referral code
• Get notified about approvals, campaign updates and photo reminders

A FlexRiders account is required. New riders are reviewed by the FlexRiders operations team before they can join campaigns.

**Screenshots [YOU]:** Play needs 2–8 phone screenshots (16:9 or 9:16, min 320 px). Take them on a phone from:
Splash, Campaigns list, Campaign detail (terms / photo slots), Today's Photos, Earnings, Profile. Use a test account — no real rider data.

## 3. App access (for Google's reviewers) [YOU]

The app needs a login. In Play Console → App content → **App access**, choose "All or some functionality is restricted" and add:
- A **dedicated reviewer rider account** (create it in the admin: Riders → Add Rider, status Approved, with a selfie).
  Enter its mobile number and password **only in Play Console** (never in Git or chat).
- Instructions: "Log in with the number and password. Open Campaigns to see campaigns and their terms. A campaign day must be
  live to take photos. Camera permission is used for the selfie at registration and the campaign photos; location for
  Start Route on a live campaign."
- Keep a live test campaign that the reviewer account is assigned to, so Photos and Route can be reviewed.

## 4. Permissions and declarations

| Permission | Used for | Screen | Required? | If denied |
|---|---|---|---|---|
| CAMERA | Driver selfie at registration; Morning/Evening/Night campaign photos (camera only, no gallery) | Register → Driver Selfie; Campaign → Today's Photos | Yes for registration and photos | Message + "Open Settings"; registration/photo can't be completed |
| ACCESS_FINE_LOCATION / COARSE | Campaign route recording between Start Route and End Route | Campaign → Today's Route | Optional | Route isn't recorded; everything else works |
| ACCESS_BACKGROUND_LOCATION | Keep recording the route with the screen off / app closed, until End Route | Campaign → Today's Route (after an in-app disclosure) | Optional ("Only while app is open" is offered) | Route records only while the app is open |
| FOREGROUND_SERVICE, FOREGROUND_SERVICE_LOCATION | Visible "Recording your campaign route" notification while recording | — | With background recording | — |
| INTERNET, VIBRATE | Networking; standard | — | — | — |

Blocked (not requested): microphone, storage, draw over other apps.

**Background location declaration [YOU] (Play Console → App content → Sensitive permissions → Location):**
- Core feature: *Campaign route recording* for riders who advertise brands while riding. The rider starts it with
  **Start Route** on a live campaign day; it records until **End Route** or the end of that campaign day, even with the
  screen off, so the FlexRiders team can verify the advertised route.
- In-app prominent disclosure: shown when the rider taps Start Route, before any permission prompt (text in
  `mobile/src/components/RouteCard.js`).
- **Video [YOU]:** record a ≤30 s screen video on a phone: open a live campaign → Start Route → disclosure → Continue →
  Android permission prompt → "Allow all the time" → the recording notification → End Route. Upload it (e.g. unlisted YouTube)
  and paste the link.
- Google may still reject background location; the fallback is "Only while app is open" (the code already supports it).

**Foreground service declaration [YOU]:** type *location* — same justification and video.

## 5. Data safety (answers must match this table)

Collected by the app and sent to the FlexRiders backend (Vercel, India region) and stored in Supabase (Mumbai):

| Play data type | What exactly | Required? | Purpose | Shared with third parties? |
|---|---|---|---|---|
| Personal info → Name | Full name | Required | Account management, app functionality | No* |
| Personal info → Phone number | Mobile number (login) | Required | Account management, app functionality | No* |
| Personal info → Email address | Email | Optional | Account management | No |
| Personal info → Other info | Date of birth (optional), work details (company/role/experience, optional), city/area, vehicle type, vehicle registration number | Mixed | App functionality (eligibility, verification) | No* |
| Photos and videos → Photos | Driver selfie (required at registration); campaign proof photos | Required | App functionality, fraud prevention / identity check by staff | No* |
| Location → Precise location | GPS points only between Start Route and End Route on campaign days | Optional | App functionality (route verification) | No* |
| Financial info → Other financial info | UPI ID, Google Pay / PhonePe number | Optional | App functionality (payouts) | No |
| App activity → Other user-generated content | Campaign join requests, photo submissions, terms acceptances | Required | App functionality | No |

\* **[YOU] decide:** if you send campaign reports, photos or route data about named riders to the **brands** (your customers),
declare the relevant types as **Shared** (with brands, for advertising-proof purposes) and say so in the privacy policy.
The app itself sends nothing to brands, analytics or ad networks.

Not collected: contacts, SMS, call logs, files, audio, calendar, health, device/advertising IDs, crash/analytics data
(no analytics or crash SDK is included), web browsing, installed apps. Passwords are sent over HTTPS and stored only as
bcrypt hashes. Not collected by the app although the database has columns for them: bank account number / IFSC.

Security answers: data is **encrypted in transit** (HTTPS only). Users **can request deletion** (in-app and web).

## 6. Account deletion

- In the app: Profile → Delete Account (password confirmation).
- Web (for Play Console "Delete account URL"): **https://flexriders.in/delete-account**
- Rule (same in both):
  - No campaign/payment history → everything is deleted (account, selfie file, all data).
  - With history → login disabled and password destroyed; selfie file, email, DOB, work details, area, UPI/GPay/bank,
    route GPS points, documents and notifications are erased. Kept: name, Rider ID, mobile number, vehicle type and number,
    campaign photos, payment/payout records, terms acceptances (payout, accounting and dispute records).
- Web requests appear in the admin under **Deletion Requests**; staff confirm the owner by phone, then Complete.

## 7. Privacy policy

Draft: `docs/PRIVACY_POLICY_DRAFT.md`. **Not published** until the [BRACKETS] are filled and you have reviewed it
(ideally with a lawyer). Then publish it at https://flexriders.in/privacy and use that URL in Play Console.

## 8. Testing tracks [YOU — needs Play Console access]

1. Create the app in Play Console (name FlexRiders, app, free).
2. Internal testing → upload `app-release.aab` → add your own testers → install from the Play link on real phones.
3. If this is a **personal** developer account created after 13 Nov 2023: run a **closed test with at least 12 testers
   opted in for 14 continuous days** before you can apply for production.
4. Complete App content (privacy policy, app access, ads = no, content rating questionnaire, target audience 18+,
   data safety, location declarations), then apply for production access.
