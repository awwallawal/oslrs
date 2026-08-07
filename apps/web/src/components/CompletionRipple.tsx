import { useReducedMotion } from '../hooks/useReducedMotion';

/**
 * A quiet, outward-flowing maroon ripple for the ENUMERATOR / clerk completion screen.
 *
 * WHY A RIPPLE AND NOT CONFETTI
 * -----------------------------
 * An enumerator completes 20-40 of these in a day, standing in front of a respondent who may have
 * just disclosed unemployment, a disability, or no income. Confetti celebrates the OPERATOR'S
 * throughput at that person's expense, and by the tenth survey it is an irritation that delays
 * moving to the next interview.
 *
 * A ripple says something different and truer: **recorded**. Concentric circles expanding from the
 * checkmark and fading — the visual language of a signal being received, not a party. Awwal's
 * description ("concentric outward flowing maroon circle in the background") is exactly the right
 * shape for the meaning.
 *
 * Pure CSS, no canvas and no dependency: three absolutely-positioned rings on a staggered
 * `ripple-out` keyframe. It costs nothing on a low-end Android in the field, which is the only
 * device that matters here.
 *
 * Decorative only — `aria-hidden`, `pointer-events-none`, behind the content (`-z-10`), and
 * suppressed entirely under `prefers-reduced-motion`.
 */
export function CompletionRipple() {
  const reducedMotion = useReducedMotion();
  if (reducedMotion) return null;

  return (
    <div
      aria-hidden="true"
      data-testid="completion-ripple"
      className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center overflow-hidden"
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="absolute rounded-full border-2 border-primary-600/30 animate-ripple-out"
          style={{
            width: 120,
            height: 120,
            // Staggered so the rings read as ONE expanding signal rather than three separate
            // pulses. ~0.9s apart over a 2.7s cycle keeps them evenly spaced.
            animationDelay: `${i * 0.9}s`,
          }}
        />
      ))}
    </div>
  );
}
