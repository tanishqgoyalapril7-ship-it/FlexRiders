import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Privacy — Flex Riders",
  description: "How Flex Riders handles personal information.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy">
      <p>
        Our full privacy policy is being finalised and will be published here. For any question
        about how Flex Riders handles personal information, please contact the Flex Riders team.
      </p>
    </LegalPage>
  );
}
