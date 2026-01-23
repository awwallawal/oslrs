import { ReactNode } from 'react';

interface AboutPageWrapperProps {
  /** Page title (H1) */
  title: string;
  /** Optional subtitle/description below the title */
  subtitle?: string;
  /** Page content */
  children: ReactNode;
}

/**
 * AboutPageWrapper - Consistent page wrapper for About section pages.
 *
 * Provides a hero section with H1 title and optional subtitle,
 * followed by the page content with consistent spacing.
 */
function AboutPageWrapper({ title, subtitle, children }: AboutPageWrapperProps) {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="bg-gradient-to-b from-primary-50 to-white py-16 lg:py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl sm:text-5xl font-brand font-semibold text-neutral-900 mb-4">
              {title}
            </h1>
            {subtitle && (
              <p className="text-lg sm:text-xl text-neutral-600">
                {subtitle}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Page Content */}
      <main>{children}</main>
    </div>
  );
}

export { AboutPageWrapper };
