// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

expect.extend(matchers);
afterEach(() => cleanup());

import { ThresholdGuard } from '../ThresholdGuard';

describe('ThresholdGuard', () => {
  it('renders children when threshold is met', () => {
    render(
      <ThresholdGuard threshold={{ met: true, currentN: 50, requiredN: 30 }} label="Test">
        <div data-testid="child-content">Content</div>
      </ThresholdGuard>
    );

    expect(screen.getByTestId('child-content')).toBeInTheDocument();
    expect(screen.queryByTestId('threshold-guard')).not.toBeInTheDocument();
  });

  it('renders progress message when threshold is not met', () => {
    render(
      <ThresholdGuard threshold={{ met: false, currentN: 15, requiredN: 50 }} label="Cross-tabulation">
        <div data-testid="child-content">Content</div>
      </ThresholdGuard>
    );

    expect(screen.queryByTestId('child-content')).not.toBeInTheDocument();
    expect(screen.getByTestId('threshold-guard')).toBeInTheDocument();
    expect(screen.getByText(/Cross-tabulation requires at least 50 submissions/)).toBeInTheDocument();
    expect(screen.getByText(/35 more needed/)).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });
});
