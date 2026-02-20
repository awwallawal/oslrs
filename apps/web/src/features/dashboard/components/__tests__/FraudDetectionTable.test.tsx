// @vitest-environment jsdom
/**
 * FraudDetectionTable Tests (Story 4.5 extensions)
 * AC4.5.2: Checkbox column, Select All, verified animation state.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

expect.extend(matchers);

import { FraudDetectionTable } from '../FraudDetectionTable';
import type { FraudDetectionListItem } from '../../api/fraud.api';

afterEach(() => {
  cleanup();
});

const makeDetection = (overrides: Partial<FraudDetectionListItem> = {}): FraudDetectionListItem => ({
  id: 'det-1',
  submissionId: 'sub-1',
  enumeratorId: 'enum-1',
  computedAt: '2026-02-20T10:00:00Z',
  totalScore: 65,
  severity: 'high',
  resolution: null,
  resolutionNotes: null,
  reviewedAt: null,
  reviewedBy: null,
  enumeratorName: 'Adewale Johnson',
  submittedAt: '2026-02-20T09:30:00Z',
  ...overrides,
});

const detections = [
  makeDetection({ id: 'det-1', enumeratorName: 'Adewale Johnson' }),
  makeDetection({ id: 'det-2', enumeratorName: 'Fatima Adebayo', totalScore: 55, severity: 'medium' }),
  makeDetection({ id: 'det-3', enumeratorName: 'Ibrahim Oladele', resolution: 'false_positive' }),
];

describe('FraudDetectionTable (Story 4.5 multi-select)', () => {
  const baseProps = {
    detections,
    onSelectDetection: vi.fn(),
  };

  it('renders without checkboxes when multiSelect is false', () => {
    render(<FraudDetectionTable {...baseProps} />);
    expect(screen.queryByTestId('select-all-checkbox')).not.toBeInTheDocument();
  });

  it('renders Select All checkbox when multiSelect is true', () => {
    render(
      <FraudDetectionTable
        {...baseProps}
        multiSelect
        isItemSelected={() => false}
        onToggleSelect={vi.fn()}
        onSelectAll={vi.fn()}
        allSelected={false}
      />,
    );
    expect(screen.getByTestId('select-all-checkbox')).toBeInTheDocument();
  });

  it('renders row checkboxes for unreviewed items', () => {
    render(
      <FraudDetectionTable
        {...baseProps}
        multiSelect
        isItemSelected={() => false}
        onToggleSelect={vi.fn()}
        onSelectAll={vi.fn()}
        allSelected={false}
      />,
    );
    // det-1 and det-2 are unreviewed (resolution null), det-3 is reviewed
    expect(screen.getByTestId('checkbox-det-1')).toBeInTheDocument();
    expect(screen.getByTestId('checkbox-det-2')).toBeInTheDocument();
    expect(screen.queryByTestId('checkbox-det-3')).not.toBeInTheDocument();
  });

  it('calls onToggleSelect when checkbox is clicked', () => {
    const onToggleSelect = vi.fn();
    render(
      <FraudDetectionTable
        {...baseProps}
        multiSelect
        isItemSelected={() => false}
        onToggleSelect={onToggleSelect}
        onSelectAll={vi.fn()}
        allSelected={false}
      />,
    );
    fireEvent.click(screen.getByTestId('checkbox-det-1'));
    expect(onToggleSelect).toHaveBeenCalledWith('det-1');
  });

  it('calls onSelectAll when header checkbox is clicked', () => {
    const onSelectAll = vi.fn();
    render(
      <FraudDetectionTable
        {...baseProps}
        multiSelect
        isItemSelected={() => false}
        onToggleSelect={vi.fn()}
        onSelectAll={onSelectAll}
        allSelected={false}
      />,
    );
    fireEvent.click(screen.getByTestId('select-all-checkbox'));
    expect(onSelectAll).toHaveBeenCalledOnce();
  });

  it('applies verified background class to verified rows', () => {
    const verifiedIds = new Set(['det-1']);
    render(
      <FraudDetectionTable
        {...baseProps}
        multiSelect
        isItemSelected={() => false}
        onToggleSelect={vi.fn()}
        onSelectAll={vi.fn()}
        allSelected={false}
        verifiedIds={verifiedIds}
      />,
    );
    const row = screen.getByTestId('fraud-row-det-1');
    expect(row.className).toContain('bg-green-50');
  });

  it('does not apply verified class to non-verified rows', () => {
    const verifiedIds = new Set(['det-1']);
    render(
      <FraudDetectionTable
        {...baseProps}
        multiSelect
        isItemSelected={() => false}
        onToggleSelect={vi.fn()}
        onSelectAll={vi.fn()}
        allSelected={false}
        verifiedIds={verifiedIds}
      />,
    );
    const row = screen.getByTestId('fraud-row-det-2');
    expect(row.className).not.toContain('bg-green-50');
  });

  it('still allows clicking rows to view evidence (original behavior)', () => {
    const onSelect = vi.fn();
    render(
      <FraudDetectionTable
        {...baseProps}
        onSelectDetection={onSelect}
        multiSelect
        isItemSelected={() => false}
        onToggleSelect={vi.fn()}
        onSelectAll={vi.fn()}
        allSelected={false}
      />,
    );
    fireEvent.click(screen.getByTestId('fraud-row-det-1'));
    expect(onSelect).toHaveBeenCalledWith('det-1');
  });
});
