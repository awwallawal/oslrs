import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, ChevronDown, ChevronUp } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from '../../components/ui/sheet';
import { aboutItems, participateItems } from './NavDropdown';

/**
 * MobileNav - Mobile slide-in navigation drawer.
 *
 * Features per AC4:
 * - Animates from right (300ms ease-out via Sheet component)
 * - Shows all navigation items vertically
 * - Includes "Register Now" and "Staff Login" CTAs
 * - Closes on outside click or escape key (Sheet behavior via Radix Dialog)
 * - Traps focus within drawer when open (Sheet behavior via Radix Dialog)
 */
function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);
  const [aboutExpanded, setAboutExpanded] = useState(false);
  const [participateExpanded, setParticipateExpanded] = useState(false);
  const location = useLocation();

  // Close menu on route change
  useEffect(() => {
    setIsOpen(false);
    setAboutExpanded(false);
    setParticipateExpanded(false);
  }, [location.pathname]);

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <button
          className="md:hidden p-2 text-neutral-700 hover:text-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 rounded-md"
          aria-label="Open navigation menu"
        >
          <Menu className="h-6 w-6" />
        </button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-[300px] sm:w-[350px] p-0"
        aria-describedby={undefined}
        hideCloseButton
      >
        <SheetHeader className="p-4 border-b border-neutral-200">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-lg font-semibold text-neutral-900">
              Menu
            </SheetTitle>
            <SheetClose asChild>
              <button
                className="p-2 text-neutral-500 hover:text-neutral-700 focus:outline-none focus:ring-2 focus:ring-primary-500 rounded-md"
                aria-label="Close navigation menu"
              >
                <X className="h-5 w-5" />
              </button>
            </SheetClose>
          </div>
        </SheetHeader>

        <nav className="flex flex-col h-[calc(100vh-80px)]" aria-label="Mobile navigation">
          <div className="flex-1 overflow-y-auto py-4">
            {/* About Section */}
            <div className="px-4">
              <button
                onClick={() => setAboutExpanded(!aboutExpanded)}
                className="flex items-center justify-between w-full py-3 text-left text-neutral-700 hover:text-primary-600 font-medium focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 rounded-md"
                aria-expanded={aboutExpanded}
                aria-controls="about-submenu"
              >
                <span>About</span>
                {aboutExpanded ? (
                  <ChevronUp className="h-5 w-5" />
                ) : (
                  <ChevronDown className="h-5 w-5" />
                )}
              </button>
              {aboutExpanded && (
                <ul id="about-submenu" className="pl-4 space-y-1">
                  {aboutItems.map((item) => (
                    <li key={item.href}>
                      <SheetClose asChild>
                        <Link
                          to={item.href}
                          className="block py-2 px-3 text-sm text-neutral-600 hover:text-primary-600 hover:bg-neutral-100 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                        >
                          {item.label}
                        </Link>
                      </SheetClose>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Participate Section */}
            <div className="px-4">
              <button
                onClick={() => setParticipateExpanded(!participateExpanded)}
                className="flex items-center justify-between w-full py-3 text-left text-neutral-700 hover:text-primary-600 font-medium focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 rounded-md"
                aria-expanded={participateExpanded}
                aria-controls="participate-submenu"
              >
                <span>Participate</span>
                {participateExpanded ? (
                  <ChevronUp className="h-5 w-5" />
                ) : (
                  <ChevronDown className="h-5 w-5" />
                )}
              </button>
              {participateExpanded && (
                <ul id="participate-submenu" className="pl-4 space-y-1">
                  {participateItems.map((item) => (
                    <li key={item.href}>
                      <SheetClose asChild>
                        <Link
                          to={item.href}
                          className="block py-2 px-3 text-sm text-neutral-600 hover:text-primary-600 hover:bg-neutral-100 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                        >
                          {item.label}
                        </Link>
                      </SheetClose>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Support Link */}
            <div className="px-4">
              <SheetClose asChild>
                <Link
                  to="/support"
                  className="block py-3 text-neutral-700 hover:text-primary-600 font-medium focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 rounded-md"
                >
                  Support
                </Link>
              </SheetClose>
            </div>

            {/* Marketplace Link */}
            <div className="px-4">
              <SheetClose asChild>
                <Link
                  to="/marketplace"
                  className="block py-3 text-neutral-700 hover:text-primary-600 font-medium focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 rounded-md"
                >
                  Marketplace
                </Link>
              </SheetClose>
            </div>
          </div>

          {/* CTAs at bottom */}
          <div className="p-4 border-t border-neutral-200 space-y-3">
            <SheetClose asChild>
              <Link
                to="/register"
                className="block w-full py-3 px-4 text-center bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-colors"
              >
                Register Now
              </Link>
            </SheetClose>
            <SheetClose asChild>
              <Link
                to="/staff/login"
                className="block w-full py-3 px-4 text-center border border-neutral-300 text-neutral-700 font-medium rounded-lg hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-colors"
              >
                Staff Login
              </Link>
            </SheetClose>
          </div>
        </nav>
      </SheetContent>
    </Sheet>
  );
}

export { MobileNav };
