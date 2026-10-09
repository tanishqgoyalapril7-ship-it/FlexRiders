import Footer from "@/components/Footer";
import MobileActionBar from "@/components/MobileActionBar";
import Navbar from "@/components/Navbar";
import Hero from "@/sections/Hero";
import Plan from "@/sections/Plan";
import Snapshot from "@/sections/Snapshot";
import HowItWorks from "@/sections/HowItWorks";
import RiderApp from "@/sections/RiderApp";
import ForBrands from "@/sections/ForBrands";
import Trust from "@/sections/Trust";
import Proof from "@/sections/Proof";
import FAQ from "@/sections/FAQ";
import FinalCTA from "@/sections/FinalCTA";

export default function Home() {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Navbar />
      <main id="main">
        <Hero />
        <Snapshot />
        <ForBrands />
        <Plan />
        <HowItWorks />
        <RiderApp />
        <Trust />
        <Proof />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
      <MobileActionBar />
    </>
  );
}
