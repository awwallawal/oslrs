import { useEffect } from 'react';

const BASE_TITLE = 'OSLSR - Oyo State Labour & Skills Registry';

/**
 * Hook to set the document title dynamically.
 * Automatically appends the base title suffix.
 *
 * @param title - The page-specific title (e.g., "Login", "About")
 * @param options - Optional configuration
 * @param options.suffix - Whether to append base title (default: true)
 *
 * @example
 * // Results in: "Login | OSLSR - Oyo State Labour & Skills Registry"
 * useDocumentTitle('Login');
 *
 * @example
 * // Results in: "Custom Title Only"
 * useDocumentTitle('Custom Title Only', { suffix: false });
 */
export function useDocumentTitle(
  title: string,
  options: { suffix?: boolean } = {}
): void {
  const { suffix = true } = options;

  useEffect(() => {
    const previousTitle = document.title;
    document.title = suffix ? `${title} | ${BASE_TITLE}` : title;

    return () => {
      document.title = previousTitle;
    };
  }, [title, suffix]);
}

export default useDocumentTitle;
