# Google Play Store Publishing Guide — Super Riders Mobile App

## 1. Prerequisites
- Active **Google Play Developer Account** ($25 one-time registration).
- **Node.js** & **Expo CLI** (`npm install -g eas-cli`).
- Unique package name: `com.superriders.riderapp` (defined in `mobile/app.json`).

---

## 2. Generate Android App Bundle (.aab) with EAS Build

1. Log in to your Expo account:
   ```bash
   cd mobile
   eas login
   ```

2. Initialize and configure EAS:
   ```bash
   eas build:configure
   ```

3. Trigger production build:
   ```bash
   eas build --platform android --profile production
   ```
   *EAS will automatically manage your Android Keystore securely on Expo servers or let you provide your custom key.*

4. Download the generated `.aab` file once the cloud build succeeds.

---

## 3. Google Play Console Setup

1. **Create New App**:
   - App Name: `Super Riders`
   - Default Language: `English (India)`
   - App or Game: `App`
   - Free or Paid: `Free`

2. **Store Listing Assets**:
   - **App Icon**: 512x512 PNG with 32-bit color.
   - **Feature Graphic**: 1024x500 JPEG/PNG.
   - **Phone Screenshots**: Minimum 2 screenshots (minimum 320px, max 3840px). Use the 7 rider app screens (Splash, Home, Payments, Profile, Registration).

3. **Content Rating & Privacy Policy**:
   - Fill out the Content Rating questionnaire (Operations / Productivity category).
   - Privacy Policy URL: host privacy policy detailing camera & location permissions for rider KYC.

4. **App Access & Reviewer Credentials**:
   - Select "All or some functionality is restricted".
   - Provide test phone number and credentials:
     - Phone: `+919876543210`
     - Password: `password123`
     - OTP: `123456`

5. **Upload & Release**:
   - Navigate to **Production** > **Create new release**.
   - Upload the `.aab` bundle.
   - Add release notes: "Super Riders v1.0.0 — Fleet onboarding and real-time payout tracking."
   - Click **Save** and **Review Release**, then **Start Rollout to Production**.
