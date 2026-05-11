// @vitest-environment jsdom

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RegistrationCompletePage from '../RegistrationCompletePage';

expect.extend(matchers);

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <RegistrationCompletePage />
    </MemoryRouter>,
  );
}

describe('RegistrationCompletePage (Story 9-12 Task 7.3)', () => {
  it('renders the registration-complete card with civic framing copy', () => {
    renderAt('/register/complete');
    expect(screen.getByTestId('registration-complete-card')).toBeInTheDocument();
    expect(screen.getByTestId('registration-complete-headline')).toHaveTextContent(
      'Registration complete',
    );
    expect(screen.getByTestId('registration-complete-marketplace')).toHaveAttribute(
      'href',
      '/marketplace',
    );
    expect(screen.getByTestId('registration-complete-signin')).toHaveAttribute(
      'href',
      '/login',
    );
  });

  it('uses the pending-NIN-specific headline when ?source=pending_nin', () => {
    renderAt('/register/complete?source=pending_nin');
    expect(screen.getByTestId('registration-complete-headline')).toHaveTextContent(
      'Your registration is now complete',
    );
  });

  it('renders the trust-badges row in the footer', () => {
    renderAt('/register/complete');
    expect(screen.getByTestId('trust-badges-row')).toBeInTheDocument();
  });
});
