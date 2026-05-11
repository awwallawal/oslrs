import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NinHelpHint } from '../NinHelpHint';

expect.extend(matchers);

/**
 * Story 9-12 AC#3 + Task 6.5 — component-isolation tests for the three
 * NinHelpHint render variants.
 */

describe('NinHelpHint', () => {
  it('inline variant renders the *346# USSD reminder in mono font', () => {
    render(<NinHelpHint variant="inline" onPendingNinClick={() => {}} />);
    expect(screen.getByTestId('nin-help-hint-inline')).toBeInTheDocument();
    const ussd = screen.getAllByTestId('nin-help-hint-ussd')[0];
    expect(ussd).toHaveTextContent('*346#');
    expect(ussd.className).toMatch(/font-mono/);
  });

  it('inline variant exposes the "I don\'t have my NIN now" link', () => {
    const onPendingNinClick = vi.fn();
    render(<NinHelpHint variant="inline" onPendingNinClick={onPendingNinClick} />);
    const link = screen.getByTestId('nin-help-hint-pending-link');
    fireEvent.click(link);
    expect(onPendingNinClick).toHaveBeenCalledTimes(1);
  });

  it('inline variant hides the pending link when hidePendingLink=true', () => {
    render(
      <NinHelpHint
        variant="inline"
        onPendingNinClick={() => {}}
        hidePendingLink
      />,
    );
    expect(screen.queryByTestId('nin-help-hint-pending-link')).toBeNull();
  });

  it('banner variant renders as a role="note" landmark with USSD chip', () => {
    render(<NinHelpHint variant="banner" />);
    const banner = screen.getByTestId('nin-help-hint-banner');
    expect(banner).toHaveAttribute('role', 'note');
    expect(banner).toHaveAttribute('aria-label', 'National Identification Number help');
    expect(screen.getAllByTestId('nin-help-hint-ussd')[0]).toHaveTextContent('*346#');
  });

  it('tooltip variant shows content only after the toggle is clicked', () => {
    render(<NinHelpHint variant="tooltip" />);
    expect(screen.queryByTestId('nin-help-hint-tooltip-content')).toBeNull();
    fireEvent.click(screen.getByTestId('nin-help-hint-tooltip-toggle'));
    expect(screen.getByTestId('nin-help-hint-tooltip-content')).toBeInTheDocument();
  });

  it('tooltip toggle button is keyboard-focusable and labelled', () => {
    render(<NinHelpHint variant="tooltip" />);
    const toggle = screen.getByTestId('nin-help-hint-tooltip-toggle');
    expect(toggle).toHaveAttribute('aria-label', 'NIN help');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('uses the supplied id so a NIN input can wire aria-describedby', () => {
    render(<NinHelpHint variant="inline" id="my-hint" onPendingNinClick={() => {}} />);
    expect(screen.getByTestId('nin-help-hint-inline')).toHaveAttribute('id', 'my-hint');
  });
});
