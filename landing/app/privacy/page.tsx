import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy — Flex Riders",
  description: "What personal information Flex Riders collects, why, who sees it and how to delete it.",
};

const h2 = { fontSize: "1.25rem", fontWeight: 700, marginTop: 16 } as const;

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        <strong>Last updated: {LEGAL.privacyUpdated}</strong> (version {LEGAL.privacyVersion})
      </p>
      <p>
        This policy explains how {LEGAL.company} (&quot;Flex Riders&quot;, &quot;we&quot;) handles personal
        information in the Flex Riders mobile app, the brand portal and this website. It covers riders (people who
        join advertising campaigns) and brands (businesses that run campaigns).
      </p>

      <h2 style={h2}>1. Information we collect</h2>
      <p><strong>Riders</strong></p>
      <ul>
        <li><strong>Account details:</strong> name, mobile number, optional email, date of birth, optional gender, city and area.</li>
        <li><strong>Verification:</strong> a selfie taken at sign-up and identity or vehicle documents you upload (for example Aadhaar, PAN, driving licence, vehicle RC).</li>
        <li><strong>Vehicle:</strong> vehicle type, model and number.</li>
        <li><strong>Working areas:</strong> up to three areas you choose.</li>
        <li><strong>Location:</strong> your device location while the app is open, to show campaigns near you. Your last known location is stored so campaigns can still reach you.</li>
        <li><strong>Campaign ride routes (background location):</strong> only after you tap <em>Start Ride</em> in an active campaign, the app records your route, including when the app is closed or the screen is off, until you tap <em>Stop</em>. A notification is shown while recording. No location is recorded in the background when no ride is running.</li>
        <li><strong>Campaign photos:</strong> the proof photos you upload for each campaign day.</li>
        <li><strong>Payout details:</strong> your UPI ID or payout number, and your earnings and payout history.</li>
        <li><strong>Support messages</strong> you send us in the app, and <strong>referral</strong> information if you refer or were referred by another rider.</li>
      </ul>
      <p><strong>Brands</strong></p>
      <ul>
        <li>Company name, contact person, mobile number, email, optional GST number and address.</li>
        <li>Campaign details you submit (areas, dates, budget, banner image) and payment records.</li>
      </ul>
      <p><strong>Everyone</strong></p>
      <ul>
        <li>One-time codes sent by SMS or email are stored only as secure hashes and expire.</li>
        <li>Basic technical records needed to keep the service secure (for example failed login attempts, stored only in a hashed form of your network address).</li>
      </ul>

      <h2 style={h2}>2. Why we use it</h2>
      <ul>
        <li>To create and secure your account, verify riders and prevent fraud.</li>
        <li>To show riders the campaigns that reach their location, working areas and vehicle type.</li>
        <li>To run campaigns: review join requests, check daily proof photos, verify ride routes, calculate earnings and pay riders.</li>
        <li>To let brands follow their own campaigns.</li>
        <li>To send you service messages (for example photo slot reminders, approvals, OTP codes) and to answer support requests.</li>
      </ul>
      <p>We do not sell your personal information and we do not show third-party advertising in the app.</p>

      <h2 style={h2}>3. Who can see your information</h2>
      <ul>
        <li><strong>The brand of a campaign you join</strong> sees your name and rider ID, your participation, your approved campaign photos and the routes you record during that campaign&apos;s rides. Brands never see your phone number, documents, selfie, date of birth or payout details.</li>
        <li><strong>The public campaign page</strong> may show approved campaign photos, without your name.</li>
        <li><strong>Flex Riders staff</strong> see what they need to verify riders, review campaigns, pay riders and give support.</li>
        <li><strong>Service providers</strong> that host and run the service for us: cloud database and private file storage (Supabase), hosting (Vercel), SMS delivery (for OTP codes) and email delivery. They process data only on our instructions.</li>
        <li>Authorities, where the law requires it.</li>
      </ul>

      <h2 style={h2}>4. Permissions on your phone</h2>
      <ul>
        <li><strong>Location (while using the app):</strong> to show campaigns near you.</li>
        <li><strong>Location (all the time):</strong> only to record a campaign ride you started, until you stop it. You can refuse this and still use the rest of the app.</li>
        <li><strong>Camera / photos:</strong> for your sign-up selfie, campaign proof photos and documents.</li>
        <li><strong>Notifications (if you allow them):</strong> for reminders and updates.</li>
      </ul>
      <p>You can change these permissions at any time in your phone&apos;s settings.</p>

      <h2 style={h2}>5. Security</h2>
      <p>
        All data is sent over encrypted connections (HTTPS). Selfies, identity documents and videos are stored in
        private storage and shown only to authorised staff through short-lived links. Passwords are stored as secure
        hashes. Repeated failed logins are blocked.
      </p>

      <h2 style={h2}>6. How long we keep it</h2>
      <p>
        We keep your account information while your account is active. Campaign, photo, route and payment records
        are kept as long as needed to complete campaigns, pay riders and meet accounting and legal obligations. When
        you delete your account, we delete or anonymise your personal information, except records we must keep by law.
      </p>

      <h2 style={h2}>7. Your choices and rights</h2>
      <ul>
        <li>See and update your profile in the app.</li>
        <li>Stop sharing location by stopping a ride or changing your phone&apos;s permission.</li>
        <li>
          <strong>Delete your account:</strong> in the app (Profile → Delete account) or on our{" "}
          <a href="/delete-account">account deletion page</a>.
        </li>
        <li>Ask us for a copy or correction of your information by writing to us (section 9).</li>
      </ul>

      <h2 style={h2}>8. Age</h2>
      <p>Flex Riders is only for people aged 18 or over. We do not knowingly collect information from children.</p>

      <h2 style={h2}>9. Contact and grievances</h2>
      <p>
        {LEGAL.company}
        <br />
        {LEGAL.address}
        <br />
        Email: <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>
        <br />
        Grievance contact: {LEGAL.grievanceOfficer} (<a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>)
      </p>
      <p>
        We may update this policy. If the changes matter, we will ask you to review and accept the new version in the
        app.
      </p>
    </LegalPage>
  );
}
