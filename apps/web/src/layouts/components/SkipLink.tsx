/**
 * SkipLink - Accessibility skip link for keyboard users.
 *
 * Provides a hidden link that becomes visible on focus,
 * allowing keyboard users to skip navigation and jump
 * directly to main content.
 *
 * WCAG 2.1 AA Requirement: Skip links help users bypass
 * repetitive navigation blocks.
 */
function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary-600 focus:text-white focus:rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
    >
      Skip to main content
    </a>
  );
}

export { SkipLink };
