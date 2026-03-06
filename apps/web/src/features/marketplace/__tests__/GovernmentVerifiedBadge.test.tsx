// @vitest-environment jsdom

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

expect.extend(matchers);

vi.mock('lucide-react', async () => {
  const actual = await vi.importActual('lucide-react');
  return {
    ...actual,
    BadgeCheck: () => <svg data-testid="badge-check-icon" />,
    Info: () => <svg data-testid="info-icon" />,
  };
});

import { GovernmentVerifiedBadge } from '../components/GovernmentVerifiedBadge';

describe('GovernmentVerifiedBadge', () => {
  it('renders badge with correct text', () => {
    render(<GovernmentVerifiedBadge />);
    expect(screen.getByText('Government Verified')).toBeInTheDocument();
  });

  it('renders badge check icon', () => {
    render(<GovernmentVerifiedBadge />);
    expect(screen.getByTestId('badge-check-icon')).toBeInTheDocument();
  });

  it('renders with green styling', () => {
    render(<GovernmentVerifiedBadge />);
    const badge = screen.getByTestId('government-verified-badge');
    const button = badge.querySelector('button');
    expect(button?.className).toContain('bg-green-100');
    expect(button?.className).toContain('text-green-700');
  });

  it('does not show info section by default', () => {
    render(<GovernmentVerifiedBadge />);
    expect(screen.queryByTestId('verification-info')).not.toBeInTheDocument();
  });

  it('expands info section when clicked', () => {
    render(<GovernmentVerifiedBadge />);
    fireEvent.click(screen.getByText('Government Verified'));
    expect(screen.getByTestId('verification-info')).toBeInTheDocument();
  });

  it('info section explains what verification means', () => {
    render(<GovernmentVerifiedBadge />);
    fireEvent.click(screen.getByText('Government Verified'));

    expect(screen.getByText('This badge means:')).toBeInTheDocument();
    expect(screen.getByText('NIN validated and identity confirmed')).toBeInTheDocument();
    expect(screen.getByText('Skills registration reviewed')).toBeInTheDocument();
    expect(screen.getByText('Real person in Oyo State')).toBeInTheDocument();
  });

  it('info section explains what verification does NOT mean', () => {
    render(<GovernmentVerifiedBadge />);
    fireEvent.click(screen.getByText('Government Verified'));

    expect(screen.getByText('What it does NOT mean:')).toBeInTheDocument();
    expect(screen.getByText('We have not tested their skills directly')).toBeInTheDocument();
    expect(screen.getByText('We do not guarantee work quality')).toBeInTheDocument();
    expect(screen.getByText('We are not responsible for employment disputes')).toBeInTheDocument();
  });

  it('collapses info section on second click', () => {
    render(<GovernmentVerifiedBadge />);
    const badge = screen.getByText('Government Verified');

    fireEvent.click(badge);
    expect(screen.getByTestId('verification-info')).toBeInTheDocument();

    fireEvent.click(badge);
    expect(screen.queryByTestId('verification-info')).not.toBeInTheDocument();
  });

  it('shows info expanded initially when showInfo prop is true', () => {
    render(<GovernmentVerifiedBadge showInfo />);
    expect(screen.getByTestId('verification-info')).toBeInTheDocument();
  });

  describe('non-interactive mode (interactive={false})', () => {
    it('renders as a span (safe inside links)', () => {
      render(<GovernmentVerifiedBadge interactive={false} />);
      const badge = screen.getByTestId('government-verified-badge');
      expect(badge.tagName).toBe('SPAN');
    });

    it('renders badge text without info icon', () => {
      render(<GovernmentVerifiedBadge interactive={false} />);
      expect(screen.getByText('Government Verified')).toBeInTheDocument();
      expect(screen.queryByTestId('info-icon')).not.toBeInTheDocument();
    });

    it('does not expand info on click', () => {
      render(<GovernmentVerifiedBadge interactive={false} />);
      fireEvent.click(screen.getByText('Government Verified'));
      expect(screen.queryByTestId('verification-info')).not.toBeInTheDocument();
    });
  });
});
