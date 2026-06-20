// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import { WizardLayout } from './WizardLayout';

afterEach(() => {
  cleanup();
});

expect.extend(matchers);

const steps = [
  { id: 'basics', label: 'Basics' },
  { id: 'review', label: 'Review' },
];

function renderLayout() {
  return render(
    <MemoryRouter>
      <WizardLayout steps={steps} currentStepIndex={0}>
        <div>Step content</div>
      </WizardLayout>
    </MemoryRouter>,
  );
}

describe('WizardLayout', () => {
  it('renders the Back to Homepage link', () => {
    renderLayout();
    expect(screen.getByRole('link', { name: /back to homepage/i })).toHaveAttribute('href', '/');
  });

  // Story 9-39 AC#4 — wrong-door recovery: a returning user who took the
  // "Register" door gets a discoverable, anti-enumeration-safe way to sign in.
  it('offers an "Already registered? Sign in" recovery link to /login', () => {
    renderLayout();
    const recovery = screen.getByTestId('wizard-already-registered');
    expect(recovery).toHaveAttribute('href', '/login');
    expect(recovery).toHaveTextContent(/already registered/i);
    expect(recovery).toHaveTextContent(/sign in/i);
  });
});
