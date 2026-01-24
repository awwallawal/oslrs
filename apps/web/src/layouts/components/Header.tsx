import { Link } from 'react-router-dom';
import { NavDropdown } from './NavDropdown';
import { MobileNav } from './MobileNav';

/**
 * Header - Global header for public pages.
 *
 * Features per AC2 and Story 1.5-6:
 * - Oyo State logo (40px height) linking to /
 * - Primary navigation: About (dropdown), Participate (dropdown), Support (dropdown), Marketplace, Contact
 * - Mobile hamburger menu (md: breakpoint, < 768px) with slide-in drawer
 * - CTA: Register (primary only - Staff Login moved to Footer per AC4)
 */
function Header() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-neutral-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link
            to="/"
            className="focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 rounded-md"
            aria-label="OSLSR Home"
          >
            <img
              src="/images/oyo-coat-of-arms.png"
              alt="Oyo State Labour & Skills Registry"
              className="h-10 w-auto"
            />
          </Link>

          {/* Desktop Navigation */}
          <NavDropdown />

          {/* Desktop CTA - Staff Login moved to Footer per Story 1.5-6 AC4 */}
          <div className="hidden md:flex items-center">
            <Link
              to="/register"
              className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-colors"
            >
              Register
            </Link>
          </div>

          {/* Mobile Navigation */}
          <MobileNav />
        </div>
      </div>
    </header>
  );
}

export { Header };
