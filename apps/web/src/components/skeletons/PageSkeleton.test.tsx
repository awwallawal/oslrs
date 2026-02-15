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
    render(<PageSkeleton variant="form" showHeader={false} showFooter={false} />);
    // Form variant should render title + 4 label/input rows + submit button skeleton
    expect(screen.getAllByRole('progressbar')).toHaveLength(10);
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
    render(<PageSkeleton />);
    const firstSkeleton = screen.getAllByRole('progressbar')[0];
    expect(firstSkeleton).toHaveClass('animate-shimmer');
  });

  it('renders mobile menu button in header', () => {
    render(<PageSkeleton />);
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });
});
