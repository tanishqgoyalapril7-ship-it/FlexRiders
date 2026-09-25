import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import Advertising from "@/sections/Advertising";
import Approvals from "@/sections/Approvals";
import Brands from "@/sections/Brands";
import Ecosystem from "@/sections/Ecosystem";
import FinalCTA from "@/sections/FinalCTA";
import Hero from "@/sections/Hero";
import HowItWorks from "@/sections/HowItWorks";
import Interlude from "@/sections/Interlude";
import Operations from "@/sections/Operations";
import Payments from "@/sections/Payments";
import Problem from "@/sections/Problem";
import Profile from "@/sections/Profile";
import Riders from "@/sections/Riders";
import Scale from "@/sections/Scale";
import Security from "@/sections/Security";

export default function Home() {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Navbar />
      <main id="main">
        <Hero />
        <Problem />
        <Ecosystem />
        <Riders />
        <Interlude />
        <Operations />
        <Approvals />
        <Brands />
        <Advertising />
        <Payments />
        <Profile />
        <Scale />
        <Security />
        <HowItWorks />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}
