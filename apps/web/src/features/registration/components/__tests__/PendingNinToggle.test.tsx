import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PendingNinToggle } from '../PendingNinToggle';

expect.extend(matchers);

/**
 * Story 9-12 AC#4 + Task 6.5 — PendingNinToggle component tests.
 */

describe('PendingNinToggle', () => {
  it('renders the toggle as a switch with the default label', () => {
    render(<PendingNinToggle pressed={false} onChange={() => {}} />);
    const toggle = screen.getByTestId('pending-nin-toggle');
    expect(toggle).toHaveAttribute('role', 'switch');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(
      screen.getByText("I don't have my NIN with me right now"),
    ).toBeInTheDocument();
  });

  it('flips aria-checked when pressed', () => {
    const { rerender } = render(
      <PendingNinToggle pressed={false} onChange={() => {}} />,
    );
    expect(screen.getByTestId('pending-nin-toggle')).toHaveAttribute(
      'aria-checked',
      'false',
    );
    rerender(<PendingNinToggle pressed onChange={() => {}} />);
    expect(screen.getByTestId('pending-nin-toggle')).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('shows the consequence-preview card only when pressed (default)', () => {
    const { rerender } = render(
      <PendingNinToggle pressed={false} onChange={() => {}} />,
    );
    expect(screen.queryByTestId('pending-nin-consequence')).toBeNull();
    rerender(<PendingNinToggle pressed onChange={() => {}} />);
    expect(screen.getByTestId('pending-nin-consequence')).toBeInTheDocument();
    // Copy intentionally omits the internal reminder cadence (operator-only).
    expect(screen.getByTestId('pending-nin-consequence')).toHaveTextContent(
      /one-click link to add your NIN whenever you're ready/,
    );
  });

  it('respects an explicit showConsequence override', () => {
    render(
      <PendingNinToggle pressed={false} onChange={() => {}} showConsequence />,
    );
    expect(screen.getByTestId('pending-nin-consequence')).toBeInTheDocument();
  });

  it('invokes onChange with the toggled value on click', () => {
    const onChange = vi.fn();
    render(<PendingNinToggle pressed={false} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('pending-nin-toggle'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('disabled state blocks click', () => {
    const onChange = vi.fn();
    render(<PendingNinToggle pressed={false} onChange={onChange} disabled />);
    fireEvent.click(screen.getByTestId('pending-nin-toggle'));
    expect(onChange).not.toHaveBeenCalled();
  });
});
