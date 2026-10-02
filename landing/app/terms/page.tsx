import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms & Conditions — Flex Riders",
  description: "The terms for riders and brands using Flex Riders.",
};

const h2 = { fontSize: "1.25rem", fontWeight: 700, marginTop: 16 } as const;

export default function TermsPage() {
  return (
    <LegalPage title="Terms & Conditions">
      <p>
        <strong>Last updated: {LEGAL.termsUpdated}</strong> (version {LEGAL.termsVersion})
      </p>
      <p>
        These terms apply to everyone who uses the Flex Riders app, brand portal or website, operated by {LEGAL.company}.
        By creating an account you agree to them and to our <a href="/privacy">Privacy Policy</a>.
      </p>

      <h2 style={h2}>1. The service</h2>
      <p>
        Flex Riders connects brands that want to advertise on the road with riders who carry campaign branding while
        they ride. Brands request campaigns; Flex Riders reviews and publishes them; riders join, ride and submit proof;
        Flex Riders verifies the proof and pays riders for approved campaign days.
      </p>

      <h2 style={h2}>2. Accounts</h2>
      <ul>
        <li>You must be at least 18 years old and give true, current information.</li>
        <li>Keep your password and one-time codes private. You are responsible for activity on your account.</li>
        <li>One account per person or business. We may suspend or close accounts that break these terms, give false information or try to cheat the service.</li>
      </ul>

      <h2 style={h2}>3. For riders</h2>
      <ul>
        <li><strong>Verification:</strong> riders are approved only after we check their details, selfie and documents.</li>
        <li><strong>Joining:</strong> joining a campaign is a request; a slot is held for you while it is reviewed, and the campaign starts for you only once approved.</li>
        <li><strong>Campaign rules:</strong> follow each campaign&apos;s requirements (area, dates, vehicle, branding or T-shirt, and its own campaign terms shown before you join).</li>
        <li><strong>Proof:</strong> upload your own, real photos in each slot&apos;s time window. Edited, reused or someone else&apos;s photos are rejected and can lead to removal from campaigns and loss of the related earnings.</li>
        <li><strong>Earnings:</strong> you earn the campaign&apos;s stated rate for each campaign day that Flex Riders approves. Earnings are not guaranteed: they depend on the campaigns you join and the days approved. Payouts are made to the UPI details in your profile, which you must keep correct.</li>
        <li><strong>Safety and law:</strong> always ride safely and follow traffic laws. Never use the app while riding. Flex Riders does not require you to ride in an unsafe way or place.</li>
        <li><strong>Independent:</strong> riders take part as independent participants, not as employees of Flex Riders or of brands.</li>
        <li><strong>Brand kit:</strong> return campaign T-shirts or branding when the campaign says so.</li>
      </ul>

      <h2 style={h2}>4. For brands</h2>
      <ul>
        <li>Campaign requests are reviewed by Flex Riders, who may ask for changes or decline them. A campaign goes live only when Flex Riders publishes it.</li>
        <li>Your campaign content must be lawful, accurate and yours to use, and must not be misleading or offensive.</li>
        <li>You agree to pay the agreed campaign amount on the agreed terms.</li>
        <li>Rider information you see (names, approved photos, routes) may be used only to follow your own campaign and must not be shared or used for anything else.</li>
      </ul>

      <h2 style={h2}>5. Acceptable use</h2>
      <p>
        Do not misuse the service: no false locations or GPS spoofing, no fake accounts, no attempts to access other
        people&apos;s data or our systems, and no harassment of riders, brands or staff.
      </p>

      <h2 style={h2}>6. Content you upload</h2>
      <p>
        You keep ownership of the photos and content you upload. You allow Flex Riders to store and use them to run
        the service, verify campaigns, show approved campaign photos to the campaign&apos;s brand and on the campaign&apos;s
        public page, and keep records.
      </p>

      <h2 style={h2}>7. Liability</h2>
      <p>
        The service is provided &quot;as is&quot;. To the extent the law allows, Flex Riders is not liable for indirect
        losses, or for accidents, fines or damage that happen while riding. Nothing in these terms limits rights you
        have under law that cannot be limited.
      </p>

      <h2 style={h2}>8. Ending your account</h2>
      <p>
        You can delete your account at any time in the app or on our <a href="/delete-account">account deletion page</a>.
        Earnings already approved will be settled according to these terms.
      </p>

      <h2 style={h2}>9. Changes and law</h2>
      <p>
        We may update these terms; if the changes matter, the app will ask you to accept the new version. These terms
        are governed by the laws of India, and courts in {LEGAL.jurisdiction} have jurisdiction.
      </p>

      <h2 style={h2}>10. Contact</h2>
      <p>
        {LEGAL.company}, {LEGAL.address}
        <br />
        Email: <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>
      </p>
    </LegalPage>
  );
}
