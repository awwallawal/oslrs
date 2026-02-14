// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';

import { Skeleton } from '../../ui/skeleton';
import { SkeletonText } from '../SkeletonText';
import { SkeletonCard } from '../SkeletonCard';
import { SkeletonAvatar } from '../SkeletonAvatar';
import { SkeletonTable } from '../SkeletonTable';
import { SkeletonForm } from '../SkeletonForm';

afterEach(() => {
  cleanup();
});

expect.extend(matchers);

describe('Skeleton Components', () => {
  describe('Skeleton (Base)', () => {
    it('renders with default props', () => {
      render(<Skeleton data-testid="skeleton" />);
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton).toBeInTheDocument();
      expect(skeleton).toHaveAttribute('aria-busy', 'true');
      expect(skeleton).toHaveAttribute('aria-label', 'Loading');
      expect(skeleton).toHaveAttribute('role', 'progressbar');
    });

    it('applies shimmer animation by default', () => {
      render(<Skeleton data-testid="skeleton" />);
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton).toHaveClass('animate-shimmer');
    });

    it('can disable animation', () => {
      render(<Skeleton data-testid="skeleton" animate={false} />);
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton).not.toHaveClass('animate-shimmer');
    });

    it('accepts custom className', () => {
      render(<Skeleton data-testid="skeleton" className="h-12 w-full" />);
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton).toHaveClass('h-12', 'w-full');
    });
  });

  describe('SkeletonText', () => {
    it('renders single line by default', () => {
      render(<SkeletonText />);
      const text = screen.getByLabelText('Loading text');
      expect(text).toBeInTheDocument();
    });

    it('renders multiple lines', () => {
      const { container } = render(<SkeletonText lines={3} />);
      const skeletons = container.querySelectorAll('[role="progressbar"]');
      expect(skeletons.length).toBe(3);
    });

    it('applies width class', () => {
      render(<SkeletonText width="md" />);
      const text = screen.getByLabelText('Loading text');
      expect(text).toHaveClass('w-1/2');
    });
  });

  describe('SkeletonCard', () => {
    it('renders with accessibility attributes', () => {
      render(<SkeletonCard />);
      const card = screen.getByLabelText('Loading card');
      expect(card).toBeInTheDocument();
      expect(card).toHaveAttribute('aria-busy', 'true');
    });

    it('renders image placeholder when withImage is true', () => {
      const { container } = render(<SkeletonCard withImage />);
      // Image skeleton is the first skeleton with h-40 class
      const imageSkeleton = container.querySelector('.h-40');
      expect(imageSkeleton).toBeInTheDocument();
    });

    it('renders without image by default', () => {
      const { container } = render(<SkeletonCard />);
      const imageSkeleton = container.querySelector('.h-40');
      expect(imageSkeleton).not.toBeInTheDocument();
    });
  });

  describe('SkeletonAvatar', () => {
    it('renders circular skeleton', () => {
      const { container } = render(<SkeletonAvatar />);
      const avatar = container.querySelector('.rounded-full');
      expect(avatar).toBeInTheDocument();
    });

    it('renders with text when withText is true', () => {
      render(<SkeletonAvatar withText />);
      const userInfo = screen.getByLabelText('Loading user info');
      expect(userInfo).toBeInTheDocument();
    });

    it('applies size class', () => {
      const { container } = render(<SkeletonAvatar size="lg" />);
      const avatar = container.querySelector('.h-12.w-12');
      expect(avatar).toBeInTheDocument();
    });
  });

  describe('SkeletonTable', () => {
    it('renders table with header by default', () => {
      const { container } = render(<SkeletonTable />);
      const thead = container.querySelector('thead');
      expect(thead).toBeInTheDocument();
    });

    it('renders specified number of rows', () => {
      const { container } = render(<SkeletonTable rows={3} />);
      const rows = container.querySelectorAll('tbody tr');
      expect(rows.length).toBe(3);
    });

    it('renders specified number of columns', () => {
      const { container } = render(<SkeletonTable columns={6} />);
      const headerCells = container.querySelectorAll('thead th');
      expect(headerCells.length).toBe(6);
    });

    it('has proper accessibility attributes', () => {
      render(<SkeletonTable />);
      const table = screen.getByLabelText('Loading table');
      expect(table).toHaveAttribute('aria-busy', 'true');
    });
  });

  describe('SkeletonForm', () => {
    it('renders form with default field count', () => {
      const { container } = render(<SkeletonForm />);
      // Each field has a label skeleton (h-4 w-24) and input skeleton (h-10)
      const inputSkeletons = container.querySelectorAll('.h-10.w-full');
      expect(inputSkeletons.length).toBe(5); // 4 field inputs + 1 button
    });

    it('renders specified number of fields', () => {
      const { container } = render(<SkeletonForm fields={2} />);
      // 2 fields + button = 3 h-10 elements
      const inputSkeletons = container.querySelectorAll('.h-10');
      expect(inputSkeletons.length).toBe(3);
    });

    it('can hide button', () => {
      const { container } = render(<SkeletonForm fields={2} withButton={false} />);
      const inputSkeletons = container.querySelectorAll('.h-10');
      expect(inputSkeletons.length).toBe(2);
    });

    it('has proper accessibility attributes', () => {
      render(<SkeletonForm />);
      const form = screen.getByLabelText('Loading form');
      expect(form).toHaveAttribute('aria-busy', 'true');
    });
  });
});
