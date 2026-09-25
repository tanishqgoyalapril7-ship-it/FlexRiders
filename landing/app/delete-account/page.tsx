import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";
import DeletionRequestForm from "./DeletionRequestForm";

export const metadata: Metadata = {
  title: "Delete your account — Flex Riders",
  description: "Ask Flex Riders to delete your rider account and personal data, even if you no longer have the app.",
};

export default function DeleteAccountPage() {
  return (
    <LegalPage title="Delete your Flex Riders account">
      <p>
        You can delete your account in the <strong>FlexRiders</strong> rider app at any time: open{" "}
        <strong>Profile → Delete Account</strong> and confirm with your password.
      </p>
      <p>
        If you no longer have the app, send a request below. The Flex Riders team will call the mobile
        number on the account to confirm that it is yours, and then delete it.
      </p>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 8 }}>What is deleted</h2>
      <ul style={{ paddingLeft: 20, display: "grid", gap: 6 }}>
        <li>Your login, driver selfie, email, date of birth, work details and area</li>
        <li>Your UPI, Google Pay / PhonePe and bank details</li>
        <li>Your recorded campaign route (GPS) data, documents and notifications</li>
        <li>If you never took part in a campaign or received a payment, everything, including your name and number</li>
      </ul>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 8 }}>What is kept</h2>
      <p>
        If you took part in a campaign or received payments, we keep your name, Rider ID, mobile number,
        vehicle type and number, the campaign photos you submitted, payment and payout records, and the
        campaign terms you accepted. These are needed for payouts, accounts and dispute handling.
      </p>
      <DeletionRequestForm />
    </LegalPage>
  );
}
