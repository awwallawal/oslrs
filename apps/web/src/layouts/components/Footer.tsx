import { Link } from 'react-router-dom';

/**
 * Quick links column items
 */
const quickLinks = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About' },
  { href: '/participate/workers', label: 'Participate' },
  { href: '/support', label: 'Support' },
  { href: '/marketplace', label: 'Marketplace' },
];

/**
 * About column items (legal & policy links)
 */
const aboutLinks = [
  { href: '/terms', label: 'Terms of Service' },
  { href: '/about/privacy', label: 'Privacy Policy' },
  { href: '/support/contact', label: 'Contact Us' },
];

/**
 * Footer - Global footer for public pages.
 *
 * Features per AC2:
 * - 3-column layout (Quick Links, Legal, Contact)
 * - Oyo State branding
 * - Copyright notice
 */
function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-neutral-900 text-white" role="contentinfo">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand Column */}
          <div className="lg:col-span-1">
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
            <p className="text-neutral-400 text-sm leading-relaxed">
              Oyo State Labour & Skills Registry - Connecting skilled workers with opportunities across Oyo State.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-300 mb-4">
              Quick Links
            </h3>
            <ul className="space-y-3">
              {quickLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    to={link.href}
                    className="text-neutral-400 hover:text-white text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-neutral-900 rounded"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* About Links */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-300 mb-4">
              About
            </h3>
            <ul className="space-y-3">
              {aboutLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    to={link.href}
                    className="text-neutral-400 hover:text-white text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-neutral-900 rounded"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact Info */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-300 mb-4">
              Contact
            </h3>
            <address className="not-italic text-neutral-400 text-sm space-y-3">
              <p>
                Ministry of Trade, Investment,
                <br />
                Cooperatives & Industry
                <br />
                Secretariat, Ibadan, Oyo State
              </p>
              <p>
                <a
                  href="mailto:info@oyotradeministry.com.ng"
                  className="hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-neutral-900 rounded"
                >
                  info@oyotradeministry.com.ng
                </a>
              </p>
              <p>
                <a
                  href="tel:+2348001234567"
                  className="hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-neutral-900 rounded"
                >
                  +234 800 123 4567
                </a>
              </p>
            </address>
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-12 pt-8 border-t border-neutral-800">
          <p className="text-neutral-500 text-sm text-center">
            &copy; {currentYear} Oyo State Government. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

export { Footer };
