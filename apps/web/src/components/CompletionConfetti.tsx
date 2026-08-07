import { useEffect, useRef } from 'react';
import { useReducedMotion } from '../hooks/useReducedMotion';

/**
 * A one-shot confetti burst for the PUBLIC registration completion screen.
 *
 * WHY HAND-ROLLED RATHER THAN A LIBRARY
 * -------------------------------------
 * `canvas-confetti` is only ~3KB gzipped, but this is a PWA that field phones and citizens on
 * modest connections download over Nigerian mobile data. Every KB is someone waiting. ~60 lines of
 * canvas gets the same effect, adds nothing to the dependency graph, and lets reduced-motion be
 * handled natively rather than bolted on.
 *
 * WHY ONLY THE PUBLIC PATH
 * ------------------------
 * A citizen has just given ten minutes to a government service that historically gives nothing
 * back; marking that is warm and it is the moment they are most likely to tell someone else to
 * register. An ENUMERATOR completes 20-40 of these a day, in front of a respondent who may have
 * just disclosed unemployment or a disability — celebration there is noise at best and tone-deaf
 * at worst. That surface gets a quiet ripple instead (`CompletionRipple`).
 *
 * Purely decorative: `aria-hidden`, `pointer-events-none`, and it never gates or delays anything.
 */
const COLOURS = ['#9C1E23', '#C9A227', '#E8C547', '#7A171B', '#F5F0E1'];
const PIECES = 90;
const DURATION_MS = 1800;

interface Piece {
  x: number; y: number; vx: number; vy: number;
  size: number; colour: string; rot: number; vr: number;
}

export function CompletionConfetti() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    // Honour the OS setting: no canvas work at all, not merely a hidden animation.
    if (reducedMotion) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = (canvas.width = window.innerWidth * dpr);
    const h = (canvas.height = window.innerHeight * dpr);
    ctx.scale(dpr, dpr);
    const vw = window.innerWidth;

    // Two side bursts rather than a top curtain: it reads as celebration instead of rainfall,
    // and it leaves the centre of the screen (where the reference number sits) unobscured.
    const pieces: Piece[] = Array.from({ length: PIECES }, (_, i) => {
      const fromLeft = i % 2 === 0;
      return {
        x: fromLeft ? 0 : vw,
        y: window.innerHeight * 0.55,
        vx: (fromLeft ? 1 : -1) * (4 + Math.random() * 6),
        vy: -(6 + Math.random() * 7),
        size: 5 + Math.random() * 6,
        colour: COLOURS[i % COLOURS.length]!,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
      };
    });

    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const elapsed = now - start;
      if (elapsed > DURATION_MS) {
        ctx.clearRect(0, 0, w, h);
        return;
      }
      ctx.clearRect(0, 0, w, h);
      const fade = Math.max(0, 1 - elapsed / DURATION_MS);
      for (const p of pieces) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.32; // gravity
        p.vx *= 0.99;
        p.rot += p.vr;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.colour;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reducedMotion]);

  if (reducedMotion) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-testid="completion-confetti"
      className="pointer-events-none fixed inset-0 z-50"
    />
  );
}
