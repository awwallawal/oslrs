// @vitest-environment jsdom
/**
 * SupervisorFraudPage Tests
 *
 * Story 2.5-4 AC3: Fraud Alerts sidebar link target
 * Verifies empty state placeholder renders correctly.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

expect.extend(matchers);
import SupervisorFraudPage from '../SupervisorFraudPage';

afterEach(() => {
  cleanup();
});

describe('SupervisorFraudPage', () => {
  it('renders page heading', () => {
    render(<SupervisorFraudPage />);
    expect(screen.getByText('Fraud Alerts')).toBeInTheDocument();
    expect(screen.getByText('Review flagged submissions and suspicious activity')).toBeInTheDocument();
  });

  it('renders empty state message', () => {
    render(<SupervisorFraudPage />);
    expect(screen.getByText('No fraud alerts')).toBeInTheDocument();
    expect(screen.getByText('Fraud detection will be available in a future update.')).toBeInTheDocument();
  });

  it('keeps fraud placeholder message visible', () => {
    render(<SupervisorFraudPage />);
    expect(screen.getByText('No fraud alerts')).toBeInTheDocument();
  });
});
