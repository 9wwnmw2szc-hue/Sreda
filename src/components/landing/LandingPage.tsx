import { AboutSection } from "./AboutSection";
import { AudienceSection } from "./AudienceSection";
import { BenefitStrip } from "./BenefitStrip";
import { ContactsSection, FinalCtaSection } from "./FinalCtaSection";
import { FaqSection } from "./FaqSection";
import { FeaturesSection } from "./FeaturesSection";
import { HeroSection } from "./HeroSection";
import { HowItWorksSection } from "./HowItWorksSection";
import { LandingForceLight } from "./LandingForceLight";
import { LandingFooter } from "./LandingFooter";
import { LandingHeader } from "./LandingHeader";
import { PlatformSection } from "./PlatformSection";
import { PricingSection } from "./PricingSection";
import "./landing.css";

export function LandingPage() {
  return (
    <LandingForceLight>
      <div className="landing">
        <LandingHeader />
        <main>
          <HeroSection />
          <BenefitStrip />
          <PlatformSection />
          <AboutSection />
          <FeaturesSection />
          <HowItWorksSection />
          <AudienceSection />
          <PricingSection />
          <FaqSection />
          <FinalCtaSection />
          <ContactsSection />
        </main>
        <LandingFooter />
      </div>
    </LandingForceLight>
  );
}
