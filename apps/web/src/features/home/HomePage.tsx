import {
  HeroSection,
  WhatIsSection,
  ParticipantsSection,
  HowItWorksSection,
  RequirementsSection,
  CoverageSection,
  MarketplacePreviewSection,
  TrustSection,
  FinalCtaSection,
} from './sections';

/**
 * HomePage - Main homepage component.
 *
 * Renders all 9 sections in the correct order per docs/public-website-ia.md.
 * Sections use consistent container patterns and responsive design.
 *
 * Section Order:
 * 1. Hero (H1 only)
 * 2. What Is OSLSR (H2)
 * 3. Who Can Participate (H2, 3 cards)
 * 4. How It Works (H2, 4 steps)
 * 5. What You'll Need (H2, checklist)
 * 6. Coverage & Progress (H2, Phase 1 placeholder)
 * 7. Marketplace Preview (H2, Phase 1 placeholder)
 * 8. Trust & Data Protection (H2)
 * 9. Final CTA (H2)
 */
function HomePage() {
  return (
    <>
      <HeroSection />
      <WhatIsSection />
      <ParticipantsSection />
      <HowItWorksSection />
      <RequirementsSection />
      <CoverageSection />
      <MarketplacePreviewSection />
      <TrustSection />
      <FinalCtaSection />
    </>
  );
}

export default HomePage;
