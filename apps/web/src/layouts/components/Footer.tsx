import { Link } from 'react-router-dom';
import { Twitter, Facebook, Instagram, Shield, ArrowRight } from 'lucide-react';

/**
 * ABOUT column items per Story 1.5-8 AC1
 */
const aboutLinks = [
  { href: '/about/initiative', label: 'The Initiative' },
  { href: '/about/how-it-works', label: 'How It Works' },
  { href: '/about/leadership', label: 'Leadership' },
  { href: '/about/partners', label: 'Partners' },
  { href: '/about/privacy', label: 'Privacy' },
];

/**
 * PARTICIPATE column items per Story 1.5-8 AC1
 */
const participateLinks = [
  { href: '/participate/workers', label: 'For Workers' },
  { href: '/participate/employers', label: 'For Employers' },
];

/**
 * SUPPORT column items per Story 1.5-8 AC1
 */
const supportLinks = [
  { href: '/support/faq', label: 'FAQ' },
  { href: '/support/guides', label: 'Guides' },
  { href: '/support/contact', label: 'Contact' },
  { href: '/support/verify-worker', label: 'Verify Worker' },
];

/**
 * LEGAL column items per Story 1.5-8 AC1
 */
const legalLinks = [
  { href: '/terms', label: 'Terms of Service' },
  { href: '/about/privacy', label: 'Privacy Policy' },
];

/**
 * Social media links per Story 1.5-8 AC2
 */
const socialLinks = [
  { href: 'https://twitter.com/oyaboremi', label: 'Twitter', icon: Twitter, ariaLabel: 'Follow us on Twitter' },
  { href: 'https://facebook.com/oyostate', label: 'Facebook', icon: Facebook, ariaLabel: 'Follow us on Facebook' },
  { href: 'https://instagram.com/oyostate', label: 'Instagram', icon: Instagram, ariaLabel: 'Follow us on Instagram' },
];

/**
 * Footer - Global footer for public pages.
 *
 * Features per Story 1.5-8:
 * - AC1: 6-column layout (ABOUT, PARTICIPATE, INSIGHTS, SUPPORT, LEGAL, CONNECT)
 * - AC2: Social media links with proper attributes
 * - AC3: NDPA Compliant badge
 * - AC4: Oyo State Seal
 * - AC8: Staff Portal link with subtle styling
 */
function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-neutral-900 text-white" role="contentinfo">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Brand Row */}
        <div className="mb-10">
          <Link
            to="/"
            className="inline-block mb-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900 rounded-md"
            aria-label="OSLSR Home"
          >
            <img
              src="/images/oyo-state-logo-white.png"
              alt="Oyo State Labour & Skills Registry"
              className="h-10 w-auto"
            />
          </Link>
          <p className="text-neutral-400 text-sm leading-relaxed max-w-md">
            Oyo State Labour & Skills Registry - Connecting skilled workers with opportunities across Oyo State.
          </p>
        </div>

        {/* 6-Column Grid per AC1 */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-8">
          {/* ABOUT Column */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-300 mb-4">
              About
            </h3>
            <ul className="space-y-3">
              {aboutLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    to={link.href}
                    className="text-neutral-400 hover:text-white text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900 rounded"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* PARTICIPATE Column */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-300 mb-4">
              Participate
            </h3>
            <ul className="space-y-3">
              {participateLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    to={link.href}
                    className="text-neutral-400 hover:text-white text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900 rounded"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* INSIGHTS Column - Coming Soon per AC1 */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-300 mb-4">
              Insights
            </h3>
            <p className="text-neutral-500 text-sm italic">Coming Soon</p>
          </div>

          {/* SUPPORT Column */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-300 mb-4">
              Support
            </h3>
            <ul className="space-y-3">
              {supportLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    to={link.href}
                    className="text-neutral-400 hover:text-white text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900 rounded"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* LEGAL Column */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-300 mb-4">
              Legal
            </h3>
            <ul className="space-y-3">
              {legalLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    to={link.href}
                    className="text-neutral-400 hover:text-white text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900 rounded"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* CONNECT Column per AC2 */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-300 mb-4">
              Connect
            </h3>
            <ul className="space-y-3">
              {socialLinks.map((link) => {
                const IconComponent = link.icon;
                return (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-neutral-400 hover:text-white text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900 rounded"
                      aria-label={link.ariaLabel}
                    >
                      <IconComponent className="h-4 w-4" />
                      <span>{link.label}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 pt-8 border-t border-neutral-800">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* Staff Portal Link per AC8 */}
            <Link
              to="/staff/login"
              className="inline-flex items-center gap-1 text-neutral-500 hover:text-neutral-400 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900 rounded"
            >
              Staff Portal
              <ArrowRight className="h-3 w-3" />
            </Link>

            {/* Copyright and Badges */}
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <p className="text-neutral-500 text-sm">
                &copy; {currentYear} Oyo State Government. All rights reserved.
              </p>

              {/* Oyo State Seal per AC4 */}
              <a
                href="https://oyostate.gov.ng"
                target="_blank"
                rel="noopener noreferrer"
                className="focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900 rounded"
                aria-label="Oyo State Government Official Website"
              >
                <img
                  src="/images/oyo-coat-of-arms.png"
                  alt="Oyo State Seal"
                  className="h-8 w-auto opacity-70 hover:opacity-100 transition-opacity"
                />
              </a>

              {/* NDPA Compliant Badge per AC3 */}
              <Link
                to="/about/privacy"
                className="inline-flex items-center gap-1.5 bg-success-900/30 text-success-400 text-xs px-2.5 py-1 rounded-full hover:bg-success-900/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
                title="Learn about our NDPA compliance"
              >
                <Shield className="h-3.5 w-3.5" />
                NDPA Compliant
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

export { Footer, aboutLinks, participateLinks, supportLinks, legalLinks, socialLinks };
