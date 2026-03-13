import { useEffect, useRef, useState } from 'react';

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function AnimatedCounter({ value, duration = 1500, prefix = '', suffix = '' }: AnimatedCounterProps) {
  const [displayValue, setDisplayValue] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!value || value <= 0) {
      setDisplayValue(0);
      return;
    }

    const start = performance.now();

    function animate(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutCubic(progress);

      setDisplayValue(Math.round(easedProgress * value));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    }

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [value, duration]);

  const formatted = displayValue.toLocaleString();

  return (
    <span aria-label={`${prefix}${value.toLocaleString()}${suffix}`}>
      {prefix}{formatted}{suffix}
    </span>
  );
}
