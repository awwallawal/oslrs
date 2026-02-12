import { Suspense, lazy } from 'react';
import { HeroSection, WhatIsSection } from './sections';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

// Lazy-load below-fold sections to reduce initial bundle and improve LCP (PERF-1)
const ParticipantsSection = lazy(() =>
  import('./sections/ParticipantsSection').then(m => ({ default: m.ParticipantsSection }))
);
const HowItWorksSection = lazy(() =>
  import('./sections/HowItWorksSection').then(m => ({ default: m.HowItWorksSection }))
);
const RequirementsSection = lazy(() =>
  import('./sections/RequirementsSection').then(m => ({ default: m.RequirementsSection }))
);
const CoverageSection = lazy(() =>
  import('./sections/CoverageSection').then(m => ({ default: m.CoverageSection }))
);
const MarketplacePreviewSection = lazy(() =>
  import('./sections/MarketplacePreviewSection').then(m => ({ default: m.MarketplacePreviewSection }))
);
const TrustSection = lazy(() =>
  import('./sections/TrustSection').then(m => ({ default: m.TrustSection }))
);
const FinalCtaSection = lazy(() =>
  import('./sections/FinalCtaSection').then(m => ({ default: m.FinalCtaSection }))
);

/**
 * HomePage - Main homepage component.
 *
 * Renders all 9 sections in the correct order per docs/public-website-ia.md.
 * Sections use consistent container patterns and responsive design.
 *
 * Section Order:
 * 1. Hero (H1 only) — eager
 * 2. What Is OSLSR (H2) — eager
 * 3. Who Can Participate (H2, 3 cards) — lazy
 * 4. How It Works (H2, 4 steps) — lazy
 * 5. What You'll Need (H2, checklist) — lazy
 * 6. Coverage & Progress (H2, Phase 1 placeholder) — lazy
 * 7. Marketplace Preview (H2, Phase 1 placeholder) — lazy
 * 8. Trust & Data Protection (H2) — lazy
 * 9. Final CTA (H2) — lazy
 */
function HomePage() {
  useDocumentTitle('Home');

  return (
    <>
      <HeroSection />
      <WhatIsSection />
      <Suspense fallback={<div className="min-h-[200px]" aria-busy="true" aria-label="Loading section" />}>
        <ParticipantsSection />
      </Suspense>
      <Suspense fallback={<div className="min-h-[200px]" aria-busy="true" aria-label="Loading section" />}>
        <HowItWorksSection />
      </Suspense>
      <Suspense fallback={<div className="min-h-[200px]" aria-busy="true" aria-label="Loading section" />}>
        <RequirementsSection />
      </Suspense>
      <Suspense fallback={<div className="min-h-[200px]" aria-busy="true" aria-label="Loading section" />}>
        <CoverageSection />
      </Suspense>
      <Suspense fallback={<div className="min-h-[200px]" aria-busy="true" aria-label="Loading section" />}>
        <MarketplacePreviewSection />
      </Suspense>
      <Suspense fallback={<div className="min-h-[200px]" aria-busy="true" aria-label="Loading section" />}>
        <TrustSection />
      </Suspense>
      <Suspense fallback={<div className="min-h-[200px]" aria-busy="true" aria-label="Loading section" />}>
        <FinalCtaSection />
      </Suspense>
    </>
  );
}

export default HomePage;
