// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';

import { PageSkeleton } from './PageSkeleton';

afterEach(() => {
  cleanup();
});

expect.extend(matchers);

describe('PageSkeleton', () => {
  it('renders with accessibility attributes', () => {
    render(<PageSkeleton />);
    const skeleton = screen.getByLabelText('Loading page');
    expect(skeleton).toBeInTheDocument();
    expect(skeleton).toHaveAttribute('aria-busy', 'true');
  });

  it('renders header by default', () => {
    const { container } = render(<PageSkeleton />);
    const header = container.querySelector('header');
    expect(header).toBeInTheDocument();
  });

  it('renders footer by default', () => {
    const { container } = render(<PageSkeleton />);
    const footer = container.querySelector('footer');
    expect(footer).toBeInTheDocument();
  });

  it('hides header when showHeader is false', () => {
    const { container } = render(<PageSkeleton showHeader={false} />);
    const header = container.querySelector('header');
    expect(header).not.toBeInTheDocument();
  });

  it('hides footer when showFooter is false', () => {
    const { container } = render(<PageSkeleton showFooter={false} />);
    const footer = container.querySelector('footer');
    expect(footer).not.toBeInTheDocument();
  });

  it('renders default variant with hero and cards', () => {
    const { container } = render(<PageSkeleton variant="default" />);
    // Should have multiple cards
    const cards = container.querySelectorAll('[aria-label="Loading card"]');
    expect(cards.length).toBeGreaterThan(0);
  });

  it('renders cards variant with grid of cards', () => {
    const { container } = render(<PageSkeleton variant="cards" />);
    const cards = container.querySelectorAll('[aria-label="Loading card"]');
    expect(cards.length).toBe(6);
  });

  it('renders form variant with form fields', () => {
    const { container } = render(<PageSkeleton variant="form" />);
    // Form variant has multiple input-like skeletons (h-10)
    const formFields = container.querySelectorAll('.h-10.w-full.rounded-md');
    expect(formFields.length).toBe(4);
  });

  it('has neutral-50 background', () => {
    render(<PageSkeleton />);
    const skeleton = screen.getByLabelText('Loading page');
    expect(skeleton).toHaveClass('bg-neutral-50');
  });

  it('accepts custom className', () => {
    render(<PageSkeleton className="custom-class" />);
    const skeleton = screen.getByLabelText('Loading page');
    expect(skeleton).toHaveClass('custom-class');
  });

  it('uses shimmer animation', () => {
    const { container } = render(<PageSkeleton />);
    const shimmers = container.querySelectorAll('.animate-shimmer');
    expect(shimmers.length).toBeGreaterThan(0);
  });

  it('renders mobile menu button in header', () => {
    const { container } = render(<PageSkeleton />);
    // Mobile menu skeleton is visible on mobile (md:hidden)
    const mobileButton = container.querySelector('.md\\:hidden');
    expect(mobileButton).toBeInTheDocument();
  });
});
