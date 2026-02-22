// @vitest-environment jsdom
/**
 * RespondentDetailSkeleton Tests
 *
 * Story 5.3 AC6: Skeleton screens matching content shape.
 * Verifies the skeleton renders the correct structure (cards + table).
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

expect.extend(matchers);

vi.mock('../../../../components/skeletons', () => ({
  SkeletonText: ({ width }: { width?: string }) => <div data-testid="skeleton-text" />,
  SkeletonCard: () => <div data-testid="skeleton-card" />,
  SkeletonTable: ({ rows, columns }: { rows: number; columns: number }) => (
    <div data-testid="skeleton-table" data-rows={rows} data-columns={columns} />
  ),
}));

import { RespondentDetailSkeleton } from '../RespondentDetailSkeleton';

afterEach(() => {
  cleanup();
});

describe('RespondentDetailSkeleton', () => {
  it('renders the skeleton container', () => {
    render(<RespondentDetailSkeleton />);

    expect(screen.getByTestId('respondent-detail-skeleton')).toBeInTheDocument();
  });

  it('renders skeleton cards for info sections', () => {
    render(<RespondentDetailSkeleton />);

    const cards = screen.getAllByTestId('skeleton-card');
    expect(cards.length).toBeGreaterThanOrEqual(2);
  });

  it('renders skeleton table for submission history', () => {
    render(<RespondentDetailSkeleton />);

    const table = screen.getByTestId('skeleton-table');
    expect(table).toBeInTheDocument();
    expect(table).toHaveAttribute('data-rows', '5');
    expect(table).toHaveAttribute('data-columns', '7');
  });
});
