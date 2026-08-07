// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CompletionConfetti } from '../CompletionConfetti';
import { CompletionRipple } from '../CompletionRipple';

/**
 * Added 2026-08-07 with the completion animations. The behaviour worth pinning is NOT that a
 * canvas appears — it is that both components disappear entirely for someone who has asked their
 * OS to reduce motion.
 *
 * Motion can genuinely nauseate people with vestibular disorders, and this is a public government
 * service that citizens have no alternative to. The codebase had no `prefers-reduced-motion`
 * handling at all before this, so there is nothing else standing between that person and a
 * particle animation.
 */
function mockReducedMotion(reduce: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion') ? reduce : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe('completion animations — reduced motion is honoured', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders confetti when motion is allowed', () => {
    mockReducedMotion(false);
    render(<CompletionConfetti />);
    expect(screen.getByTestId('completion-confetti')).toBeInTheDocument();
  });

  it('renders NOTHING when the user asked for reduced motion', () => {
    mockReducedMotion(true);
    const { container } = render(<CompletionConfetti />);
    expect(screen.queryByTestId('completion-confetti')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the ripple when motion is allowed', () => {
    mockReducedMotion(false);
    render(<CompletionRipple />);
    expect(screen.getByTestId('completion-ripple')).toBeInTheDocument();
  });

  it('suppresses the ripple under reduced motion', () => {
    mockReducedMotion(true);
    const { container } = render(<CompletionRipple />);
    expect(screen.queryByTestId('completion-ripple')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  /** Decorative means decorative: never announced, never interactive. */
  it('is hidden from assistive tech and cannot swallow a tap', () => {
    mockReducedMotion(false);
    render(<CompletionRipple />);
    const el = screen.getByTestId('completion-ripple');
    expect(el).toHaveAttribute('aria-hidden', 'true');
    expect(el.className).toContain('pointer-events-none');
  });
});
