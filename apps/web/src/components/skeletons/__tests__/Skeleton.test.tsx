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
      render(<SkeletonCard withImage />);
      expect(screen.getAllByRole('progressbar')).toHaveLength(7);
    });

    it('renders without image by default', () => {
      render(<SkeletonCard />);
      expect(screen.getAllByRole('progressbar')).toHaveLength(6);
    });
  });

  describe('SkeletonAvatar', () => {
    it('renders circular skeleton', () => {
      render(<SkeletonAvatar />);
      expect(screen.getByLabelText('Loading avatar')).toBeInTheDocument();
    });

    it('renders with text when withText is true', () => {
      render(<SkeletonAvatar withText />);
      const userInfo = screen.getByLabelText('Loading user info');
      expect(userInfo).toBeInTheDocument();
    });

    it('applies size class', () => {
      render(<SkeletonAvatar size="lg" />);
      const avatar = screen.getByLabelText('Loading avatar');
      expect(avatar).toBeInTheDocument();
      expect(avatar).toHaveClass('h-12', 'w-12');
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
      render(<SkeletonForm />);
      expect(screen.getAllByRole('progressbar')).toHaveLength(9);
    });

    it('renders specified number of fields', () => {
      render(<SkeletonForm fields={2} />);
      expect(screen.getAllByRole('progressbar')).toHaveLength(5);
    });

    it('can hide button', () => {
      render(<SkeletonForm fields={2} withButton={false} />);
      expect(screen.getAllByRole('progressbar')).toHaveLength(4);
    });

    it('has proper accessibility attributes', () => {
      render(<SkeletonForm />);
      const form = screen.getByLabelText('Loading form');
      expect(form).toHaveAttribute('aria-busy', 'true');
    });
  });
});
