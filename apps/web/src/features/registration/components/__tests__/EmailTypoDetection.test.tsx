import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EmailTypoDetection } from '../EmailTypoDetection';

expect.extend(matchers);

/**
 * Story 9-12 AC#5 + Task 6.5 — EmailTypoDetection component tests.
 *
 * Verifies the rendered output for known typo domains AND silence for
 * unknown-domain (or partial) values.
 */

describe('EmailTypoDetection', () => {
  it('renders nothing when the domain is unknown', () => {
    render(<EmailTypoDetection email="user@example.com" onAccept={() => {}} />);
    expect(screen.queryByTestId('email-typo-suggestion')).toBeNull();
  });

  it('renders nothing when the email is empty', () => {
    render(<EmailTypoDetection email="" onAccept={() => {}} />);
    expect(screen.queryByTestId('email-typo-suggestion')).toBeNull();
  });

  it('surfaces the corrected domain for a known typo', () => {
    render(<EmailTypoDetection email="user@gmail.con" onAccept={() => {}} />);
    expect(screen.getByTestId('email-typo-suggestion')).toHaveTextContent(
      /user@gmail\.com/,
    );
  });

  it('renders a polite live region so screen readers announce the suggestion', () => {
    render(<EmailTypoDetection email="user@yahoo.con" onAccept={() => {}} />);
    const region = screen.getByTestId('email-typo-suggestion');
    expect(region).toHaveAttribute('role', 'status');
    expect(region).toHaveAttribute('aria-live', 'polite');
  });

  it('invokes onAccept with the corrected email when "Use this" is clicked', () => {
    const onAccept = vi.fn();
    render(<EmailTypoDetection email="user@hotmial.com" onAccept={onAccept} />);
    fireEvent.click(screen.getByTestId('email-typo-accept'));
    expect(onAccept).toHaveBeenCalledWith('user@hotmail.com');
  });

  it('ignores values without a domain (partial typing)', () => {
    render(<EmailTypoDetection email="user@gma" onAccept={() => {}} />);
    expect(screen.queryByTestId('email-typo-suggestion')).toBeNull();
  });
});
