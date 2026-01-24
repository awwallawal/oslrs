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
import { aboutItems, participateItems, supportItems, insightsItems } from './NavDropdown';
import { SmartCta } from './SmartCta';

/**
 * MobileNav - Mobile slide-in navigation drawer.
 *
 * Features per Story 1.5-6 AC6:
 * - Animates from right (300ms ease-out via Sheet component)
 * - About, Participate, Support expandable sections
 * - Contact as navigation item
 * - Staff Login NOT in mobile navigation (moved to Footer)
 * - Closes on outside click or escape key (Sheet behavior via Radix Dialog)
 * - Traps focus within drawer when open (Sheet behavior via Radix Dialog)
 */
function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);
  const [aboutExpanded, setAboutExpanded] = useState(false);
  const [participateExpanded, setParticipateExpanded] = useState(false);
  const [supportExpanded, setSupportExpanded] = useState(false);
  const [insightsExpanded, setInsightsExpanded] = useState(false);
  const location = useLocation();

  // Close menu on route change
  useEffect(() => {
    setIsOpen(false);
    setAboutExpanded(false);
    setParticipateExpanded(false);
    setSupportExpanded(false);
    setInsightsExpanded(false);
  }, [location.pathname]);

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <button
          className="md:hidden p-2 text-neutral-700 hover:text-primary-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 rounded-md"
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
                className="p-2 text-neutral-500 hover:text-neutral-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded-md"
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
                className="flex items-center justify-between w-full py-3 text-left text-neutral-700 hover:text-primary-600 font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 rounded-md"
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
                          className="block py-2 px-3 text-sm text-neutral-600 hover:text-primary-600 hover:bg-neutral-100 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
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
                className="flex items-center justify-between w-full py-3 text-left text-neutral-700 hover:text-primary-600 font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 rounded-md"
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
                          className="block py-2 px-3 text-sm text-neutral-600 hover:text-primary-600 hover:bg-neutral-100 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                        >
                          {item.label}
                        </Link>
                      </SheetClose>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Support Section - per AC6 */}
            <div className="px-4">
              <button
                onClick={() => setSupportExpanded(!supportExpanded)}
                className="flex items-center justify-between w-full py-3 text-left text-neutral-700 hover:text-primary-600 font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 rounded-md"
                aria-expanded={supportExpanded}
                aria-controls="support-submenu"
              >
                <span>Support</span>
                {supportExpanded ? (
                  <ChevronUp className="h-5 w-5" />
                ) : (
                  <ChevronDown className="h-5 w-5" />
                )}
              </button>
              {supportExpanded && (
                <ul id="support-submenu" className="pl-4 space-y-1">
                  {supportItems.map((item) => (
                    <li key={item.href}>
                      <SheetClose asChild>
                        <Link
                          to={item.href}
                          className="block py-2 px-3 text-sm text-neutral-600 hover:text-primary-600 hover:bg-neutral-100 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                        >
                          {item.label}
                        </Link>
                      </SheetClose>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Marketplace Link */}
            <div className="px-4">
              <SheetClose asChild>
                <Link
                  to="/marketplace"
                  className="block py-3 text-neutral-700 hover:text-primary-600 font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 rounded-md"
                >
                  Marketplace
                </Link>
              </SheetClose>
            </div>

            {/* Insights Section - per Story 1.5-8 AC6/AC7 */}
            <div className="px-4">
              <button
                onClick={() => setInsightsExpanded(!insightsExpanded)}
                className="flex items-center justify-between w-full py-3 text-left text-neutral-700 hover:text-primary-600 font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 rounded-md"
                aria-expanded={insightsExpanded}
                aria-controls="insights-submenu"
              >
                <span className="flex items-center gap-2">
                  Insights
                  <span className="text-xs bg-neutral-100 text-neutral-500 px-1.5 py-0.5 rounded">
                    Coming Soon
                  </span>
                </span>
                {insightsExpanded ? (
                  <ChevronUp className="h-5 w-5" />
                ) : (
                  <ChevronDown className="h-5 w-5" />
                )}
              </button>
              {insightsExpanded && (
                <ul id="insights-submenu" className="pl-4 space-y-1">
                  {insightsItems.map((item) => (
                    <li key={item.label}>
                      <div
                        className="block py-2 px-3 text-sm text-neutral-400 cursor-default rounded-md"
                        aria-disabled="true"
                      >
                        <span className="flex items-center gap-2">
                          {item.label}
                          <span className="text-xs text-neutral-400">Coming Soon</span>
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Contact Link - per AC6 */}
            <div className="px-4">
              <SheetClose asChild>
                <Link
                  to="/support/contact"
                  className="block py-3 text-neutral-700 hover:text-primary-600 font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 rounded-md"
                >
                  Contact
                </Link>
              </SheetClose>
            </div>
          </div>

          {/* CTA at bottom - Auth-aware per Story 1.5-8 AC5 */}
          <div className="p-4 border-t border-neutral-200">
            <SmartCta className="block w-full py-3 text-center" />
          </div>
        </nav>
      </SheetContent>
    </Sheet>
  );
}

export { MobileNav };
