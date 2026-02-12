import { Link } from 'react-router-dom';
import { Shield, ArrowRight } from 'lucide-react';
import { SectionWrapper, SectionHeading } from '../components';

/**
 * TrustSection - "Trust & Data Protection" section.
 *
 * Shows official seals, NDPA compliance, and privacy link.
 * Uses existing image assets from /images/ folder.
 */
function TrustSection() {
  return (
    <SectionWrapper variant="light" id="trust">
      <div className="max-w-4xl mx-auto">
        <SectionHeading centered>Trust & Data Protection</SectionHeading>

        {/* Trust badges */}
        <div className="flex flex-wrap items-center justify-center gap-8 mb-10">
          {/* Oyo State Seal */}
          <img
            src="/images/oyo-coat-of-arms.png"
            alt="Oyo State Seal"
            className="h-20 w-auto"
            loading="lazy"
            width={80}
            height={80}
          />

          {/* Ministry Logo */}
          <img
            src="/images/oyo-state-logo.svg"
            alt="Ministry of Trade, Investment, Cooperatives & Industry"
            className="h-16 w-auto"
            loading="lazy"
            width={64}
            height={64}
          />

          {/* NDPA Compliance Badge */}
          <div className="flex items-center gap-2 px-4 py-2 bg-success-100 rounded-full">
            <Shield className="w-5 h-5 text-success-600" />
            <span className="text-success-600 font-medium text-sm">NDPA Compliant</span>
          </div>
        </div>

        {/* Trust statement */}
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-neutral-600 mb-6">
            Your data is protected under the Nigeria Data Protection Act (NDPA).
            We only collect information necessary for workforce planning and will
            never share your personal details without your consent.
          </p>

          <Link
            to="/about/privacy"
            className="inline-flex items-center gap-2 text-primary-600 font-medium hover:text-primary-700 transition-colors group"
          >
            Read Our Privacy Policy
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </div>
    </SectionWrapper>
  );
}

export { TrustSection };
