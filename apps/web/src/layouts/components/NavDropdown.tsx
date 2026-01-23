import { Link } from 'react-router-dom';
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from '../../components/ui/navigation-menu';
import { cn } from '../../lib/utils';

/**
 * Navigation items structure per public-website-ia.md
 */
const aboutItems = [
  { href: '/about', label: 'About OSLSR', description: 'Overview of the initiative' },
  { href: '/about/initiative', label: 'The Initiative', description: 'Why we are building this registry' },
  { href: '/about/how-it-works', label: 'How It Works', description: 'Understand the registration process' },
  { href: '/about/leadership', label: 'Leadership', description: 'Meet the ministry leadership team' },
  { href: '/about/partners', label: 'Partners', description: 'Our collaborating organizations' },
  { href: '/about/privacy', label: 'Privacy', description: 'How we protect your data' },
];

const participateItems = [
  { href: '/participate', label: 'Get Started', description: 'Choose your path - worker or employer' },
  { href: '/participate/workers', label: 'For Workers', description: 'Register your skills and find opportunities' },
  { href: '/participate/employers', label: 'For Employers', description: 'Access the skilled workforce database' },
];

/**
 * NavDropdown - Desktop navigation with accessible dropdowns.
 *
 * Uses shadcn NavigationMenu for accessible dropdowns with
 * keyboard navigation support (Arrow keys, Enter, Escape).
 */
function NavDropdown() {
  return (
    <NavigationMenu className="hidden md:flex">
      <NavigationMenuList>
        {/* About Dropdown */}
        <NavigationMenuItem>
          <NavigationMenuTrigger className="text-neutral-700 hover:text-primary-600 bg-transparent hover:bg-transparent focus:bg-transparent data-[state=open]:bg-transparent">
            About
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid w-[400px] gap-3 p-4 md:w-[500px] md:grid-cols-2">
              {aboutItems.map((item) => (
                <li key={item.href}>
                  <NavigationMenuLink asChild>
                    <Link
                      to={item.href}
                      className={cn(
                        'block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors',
                        'hover:bg-neutral-100 hover:text-primary-600 focus:bg-neutral-100 focus:text-primary-600',
                        'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2'
                      )}
                    >
                      <div className="text-sm font-medium leading-none">{item.label}</div>
                      <p className="line-clamp-2 text-sm leading-snug text-neutral-500">
                        {item.description}
                      </p>
                    </Link>
                  </NavigationMenuLink>
                </li>
              ))}
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>

        {/* Participate Dropdown */}
        <NavigationMenuItem>
          <NavigationMenuTrigger className="text-neutral-700 hover:text-primary-600 bg-transparent hover:bg-transparent focus:bg-transparent data-[state=open]:bg-transparent">
            Participate
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid w-[400px] gap-3 p-4">
              {participateItems.map((item) => (
                <li key={item.href}>
                  <NavigationMenuLink asChild>
                    <Link
                      to={item.href}
                      className={cn(
                        'block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors',
                        'hover:bg-neutral-100 hover:text-primary-600 focus:bg-neutral-100 focus:text-primary-600',
                        'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2'
                      )}
                    >
                      <div className="text-sm font-medium leading-none">{item.label}</div>
                      <p className="line-clamp-2 text-sm leading-snug text-neutral-500">
                        {item.description}
                      </p>
                    </Link>
                  </NavigationMenuLink>
                </li>
              ))}
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>

        {/* Support Link */}
        <NavigationMenuItem>
          <NavigationMenuLink asChild>
            <Link
              to="/support"
              className={cn(navigationMenuTriggerStyle(), 'text-neutral-700 hover:text-primary-600 bg-transparent hover:bg-transparent focus:bg-transparent')}
            >
              Support
            </Link>
          </NavigationMenuLink>
        </NavigationMenuItem>

        {/* Marketplace Link */}
        <NavigationMenuItem>
          <NavigationMenuLink asChild>
            <Link
              to="/marketplace"
              className={cn(navigationMenuTriggerStyle(), 'text-neutral-700 hover:text-primary-600 bg-transparent hover:bg-transparent focus:bg-transparent')}
            >
              Marketplace
            </Link>
          </NavigationMenuLink>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  );
}

export { NavDropdown, aboutItems, participateItems };
