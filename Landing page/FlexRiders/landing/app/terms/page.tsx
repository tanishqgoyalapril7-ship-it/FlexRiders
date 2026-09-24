import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Terms — Flex Riders",
  description: "Terms of use for Flex Riders.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms">
      <p>
        Our terms of use are being finalised and will be published here. For any question about
        using Flex Riders, please contact the Flex Riders team.
      </p>
    </LegalPage>
  );
}
