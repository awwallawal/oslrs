// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { AnimatedCounter } from '../AnimatedCounter';

expect.extend(matchers);
afterEach(() => cleanup());

describe('AnimatedCounter', () => {
  it('renders final value after animation completes', async () => {
    vi.useFakeTimers();
    render(<AnimatedCounter value={1234} duration={100} />);

    // Fast-forward past animation duration
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByText(/1,234/)).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('renders prefix and suffix', () => {
    vi.useFakeTimers();
    render(<AnimatedCounter value={50} duration={100} prefix="$" suffix="%" />);

    // The aria-label always shows the final value
    expect(screen.getByLabelText('$50%')).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('handles zero value', () => {
    render(<AnimatedCounter value={0} />);
    expect(screen.getByLabelText('0')).toBeInTheDocument();
  });
});
