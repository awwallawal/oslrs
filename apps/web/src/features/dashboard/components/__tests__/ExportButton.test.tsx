// @vitest-environment jsdom
/**
 * ExportButton Tests
 *
 * Story 5.4 Task 6: Reusable export button component.
 * Note: Radix UI DropdownMenu renders in portals which are not fully supported
 * in jsdom. We test the single-button (defaultFormat) mode and basic rendering.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

expect.extend(matchers);

// ── Hoisted mocks ───────────────────────────────────────────────────────────

const mockDownload = vi.fn().mockResolvedValue('oslsr-export-2026-02-22.csv');
let mockIsDownloading = false;

vi.mock('../../hooks/useExport', () => ({
  useExportDownload: () => ({
    download: mockDownload,
    isDownloading: mockIsDownloading,
    error: null,
  }),
}));

vi.mock('../../../../hooks/useToast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

import { ExportButton } from '../ExportButton';

afterEach(() => {
  cleanup();
});

// ── Tests ─────────────────────────────────────────────────────────────

describe('ExportButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsDownloading = false;
  });

  it('renders dropdown button', () => {
    render(<ExportButton filters={{}} />);

    const button = screen.getByTestId('export-button');
    expect(button).toBeInTheDocument();
    expect(button.textContent).toContain('Export');
  });

  it('renders single-format button with defaultFormat=csv', () => {
    render(<ExportButton filters={{}} defaultFormat="csv" />);

    const button = screen.getByTestId('export-button');
    expect(button.textContent).toContain('Export CSV');
  });

  it('renders single-format button with defaultFormat=pdf', () => {
    render(<ExportButton filters={{}} defaultFormat="pdf" />);

    const button = screen.getByTestId('export-button');
    expect(button.textContent).toContain('Export PDF');
  });

  it('triggers download directly when defaultFormat is set', async () => {
    render(<ExportButton filters={{ source: 'enumerator' }} defaultFormat="csv" />);

    fireEvent.click(screen.getByTestId('export-button'));

    await waitFor(() => {
      expect(mockDownload).toHaveBeenCalledWith({ source: 'enumerator' }, 'csv');
    });
  });

  it('passes filters to download function', async () => {
    render(<ExportButton filters={{ lgaId: 'ibadan-north', severity: 'high' }} defaultFormat="pdf" />);

    fireEvent.click(screen.getByTestId('export-button'));

    await waitFor(() => {
      expect(mockDownload).toHaveBeenCalledWith(
        { lgaId: 'ibadan-north', severity: 'high' },
        'pdf',
      );
    });
  });

  it('shows loading state during download', () => {
    mockIsDownloading = true;
    render(<ExportButton filters={{}} />);

    const button = screen.getByTestId('export-button');
    expect(button).toBeDisabled();
    expect(button.textContent).toContain('Exporting...');
  });

  it('disables button during download in defaultFormat mode', () => {
    mockIsDownloading = true;
    render(<ExportButton filters={{}} defaultFormat="csv" />);

    const button = screen.getByTestId('export-button');
    expect(button).toBeDisabled();
    expect(button.textContent).toContain('Exporting...');
  });
});
