import { useEffect, useState } from 'react';

/**
 * Does this person want animation suppressed?
 *
 * Added 2026-08-07 with the completion animations, because the codebase had **no
 * `prefers-reduced-motion` handling anywhere** — worth fixing on its own terms, not just for
 * confetti.
 *
 * Motion is not decoration for everyone. Vestibular disorders make sweeping or particle animation
 * genuinely nauseating, and the OS-level setting is how people say so. This is a public government
 * service that citizens have no alternative to, so honouring it is not a nicety.
 *
 * Live-updating: the listener stays attached, so toggling the OS setting takes effect without a
 * reload. Defaults to `false` where `matchMedia` is unavailable (old browsers, jsdom) — animation
 * is the safe default there because the alternative is suppressing it for everyone.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return reduced;
}
