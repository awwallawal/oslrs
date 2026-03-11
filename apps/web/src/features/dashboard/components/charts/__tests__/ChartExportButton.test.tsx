// @vitest-environment jsdom
/**
 * ChartExportButton Tests
 *
 * Story 8.2: Verify export button renders, is disabled when empty,
 * calls exportToCSV on click, and has accessible label.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

expect.extend(matchers);
afterEach(() => cleanup());

const mockExportToCSV = vi.fn();

vi.mock('../../../utils/csv-export', () => ({
  exportToCSV: (...args: unknown[]) => mockExportToCSV(...args),
}));

import { ChartExportButton } from '../ChartExportButton';

describe('ChartExportButton', () => {
  it('renders a button with accessible label', () => {
    const data = [{ label: 'a', count: 1 }];
    render(<ChartExportButton data={data} filename="demographics" />);

    const button = screen.getByRole('button', { name: /export demographics as csv/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('title', 'Export as CSV');
  });

  it('is disabled when data is empty', () => {
    render(<ChartExportButton data={[]} filename="empty" />);

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });

  it('is disabled when data is undefined-like (empty array)', () => {
    render(<ChartExportButton data={[]} filename="test" />);

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });

  it('is enabled when data has items', () => {
    const data = [{ label: 'male', count: 50 }];
    render(<ChartExportButton data={data} filename="gender" />);

    const button = screen.getByRole('button');
    expect(button).not.toBeDisabled();
  });

  it('calls exportToCSV with correct data and filename on click', () => {
    const data = [
      { label: 'employed', count: 80, percentage: 80 },
      { label: 'unemployed', count: 20, percentage: 20 },
    ];
    render(<ChartExportButton data={data} filename="employment" />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(mockExportToCSV).toHaveBeenCalledTimes(1);
    expect(mockExportToCSV).toHaveBeenCalledWith(data, 'employment');
  });

  it('does not call exportToCSV when button is disabled', () => {
    render(<ChartExportButton data={[]} filename="empty" />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(mockExportToCSV).not.toHaveBeenCalled();
  });
});
