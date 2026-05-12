import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrustBadgesRow } from '../TrustBadgesRow';

expect.extend(matchers);

/**
 * Story 9-12 AC#8 + Task 6.5 — TrustBadgesRow component tests.
 */

describe('TrustBadgesRow', () => {
  it('renders three badges with the canonical labels', () => {
    render(<TrustBadgesRow />);
    expect(screen.getByText('Secure Registration')).toBeInTheDocument();
    expect(screen.getByText('Official Oyo State Platform')).toBeInTheDocument();
    expect(screen.getByText('Free to Join')).toBeInTheDocument();
  });

  it('each badge exposes an aria-label for the assurance', () => {
    render(<TrustBadgesRow />);
    expect(screen.getByTestId('trust-badge-secure')).toHaveAttribute(
      'aria-label',
      'Secure registration. Data transmitted over encrypted HTTPS.',
    );
    expect(screen.getByTestId('trust-badge-official')).toHaveAttribute(
      'aria-label',
      'Official Oyo State Government platform',
    );
    expect(screen.getByTestId('trust-badge-free')).toHaveAttribute(
      'aria-label',
      'Free to join. No registration fee.',
    );
  });

  it('each badge is a role="note" landmark', () => {
    render(<TrustBadgesRow />);
    expect(screen.getByTestId('trust-badge-secure')).toHaveAttribute(
      'role',
      'note',
    );
    expect(screen.getByTestId('trust-badge-official')).toHaveAttribute(
      'role',
      'note',
    );
    expect(screen.getByTestId('trust-badge-free')).toHaveAttribute(
      'role',
      'note',
    );
  });
});
