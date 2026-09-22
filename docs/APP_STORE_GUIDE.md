# Apple App Store Publishing Guide — Super Riders Mobile App

## 1. Prerequisites
- Apple Developer Program membership ($99/year).
- Mac with Xcode (optional if using Expo EAS Cloud Build).
- App Bundle Identifier: `com.superriders.riderapp` (configured in `mobile/app.json`).

---

## 2. Generate iOS Archive (.ipa) with EAS Build

1. Configure EAS Credentials:
   ```bash
   cd mobile
   eas credentials
   ```
   *Follow the prompts to let EAS generate or link your Apple Distribution Certificate and Provisioning Profile.*

2. Build iOS production binary:
   ```bash
   eas build --platform ios --profile production
   ```

3. Automatically submit to TestFlight / App Store Connect:
   ```bash
   eas submit --platform ios
   ```

---

## 3. App Store Connect Setup

1. **Create New App**:
   - Platform: `iOS`
   - Name: `Super Riders`
   - Primary Language: `English`
   - Bundle ID: `com.superriders.riderapp`
   - SKU: `SR-MOBILE-01`

2. **App Store Screenshots**:
   - 6.7" Display (iPhone 15 Pro Max): 1290 x 2796 pixels.
   - 6.5" Display (iPhone 11 Pro Max): 1242 x 2688 pixels.

3. **App Privacy & Data Nutrition Labels**:
   - Declare Data Collected: Contact Info (Phone number, Name), Financial Info (UPI payment identifier), Location (while using app for order allocation).

4. **App Review Information**:
   - Contact email and phone.
   - Demo account for Apple reviewer:
     - Phone: `+919876543210`
     - Password: `password123`
     - Test OTP: `123456`

5. **TestFlight Beta Testing**:
   - Once the build processes, invite internal operations team members via TestFlight for end-to-end verification.
   - When verified, click **Submit for Review**.
