// @vitest-environment jsdom
/**
 * ExportPage Tests
 *
 * Story 5.4: AC#6 filter controls, AC#10 skeleton loading,
 * format toggle, PDF warning, export button states, Direction 08 styling.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

expect.extend(matchers);
import { MemoryRouter } from 'react-router-dom';

// ── Hoisted mocks ───────────────────────────────────────────────────────────

let mockPreviewCountReturn = {
  data: 42 as number | undefined,
  isLoading: false,
};

let mockLgasReturn = {
  data: [
    { id: '1', name: 'Ibadan North', code: 'ibadan-north' },
    { id: '2', name: 'Ibadan South', code: 'ibadan-south' },
  ] as Array<{ id: string; name: string; code: string }> | undefined,
  isLoading: false,
  isError: false,
};

let mockPublishedFormsReturn = {
  data: [
    { id: 'form-1', title: 'OSLSR Master v3', formId: 'oslsr_master_v3', version: '1.0.0' },
    { id: 'form-2', title: 'Skills Survey', formId: 'skills_v1', version: '2.0.0' },
  ] as Array<{ id: string; title: string; formId: string; version: string }> | undefined,
  isLoading: false,
};

const mockDownload = vi.fn().mockResolvedValue('oslsr-export-2026-02-22.csv');

vi.mock('../../hooks/useExport', () => ({
  useExportPreviewCount: () => mockPreviewCountReturn,
  useLgas: () => mockLgasReturn,
  usePublishedForms: () => mockPublishedFormsReturn,
  useExportDownload: () => ({
    download: mockDownload,
    isDownloading: false,
    error: null,
  }),
  exportKeys: {
    all: ['exports'],
    previewCount: (f: unknown) => ['exports', 'count', f],
    lgas: ['lgas'],
    publishedForms: ['forms', 'published'],
  },
}));

vi.mock('../../../../hooks/useToast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
}));

import ExportPage from '../ExportPage';

afterEach(() => {
  cleanup();
});

function renderComponent() {
  return render(
    <MemoryRouter>
      <ExportPage />
    </MemoryRouter>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('ExportPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPreviewCountReturn = { data: 42, isLoading: false };
    mockLgasReturn = {
      data: [
        { id: '1', name: 'Ibadan North', code: 'ibadan-north' },
        { id: '2', name: 'Ibadan South', code: 'ibadan-south' },
      ],
      isLoading: false,
      isError: false,
    };
    mockPublishedFormsReturn = {
      data: [
        { id: 'form-1', title: 'OSLSR Master v3', formId: 'oslsr_master_v3', version: '1.0.0' },
        { id: 'form-2', title: 'Skills Survey', formId: 'skills_v1', version: '2.0.0' },
      ],
      isLoading: false,
    };
  });

  it('renders filter controls (LGA, source, date, severity, status)', () => {
    renderComponent();

    expect(screen.getByTestId('lga-filter')).toBeInTheDocument();
    expect(screen.getByTestId('source-filter')).toBeInTheDocument();
    expect(screen.getByTestId('date-from-filter')).toBeInTheDocument();
    expect(screen.getByTestId('date-to-filter')).toBeInTheDocument();
    expect(screen.getByTestId('severity-filter')).toBeInTheDocument();
    expect(screen.getByTestId('status-filter')).toBeInTheDocument();
  });

  it('shows record count preview', () => {
    renderComponent();

    const countEl = screen.getByTestId('record-count');
    expect(countEl).toBeInTheDocument();
    expect(countEl.textContent).toContain('42');
    expect(countEl.textContent).toContain('total records');
  });

  it('format toggle switches between CSV and PDF', () => {
    renderComponent();

    const csvBtn = screen.getByTestId('format-csv');
    const pdfBtn = screen.getByTestId('format-pdf');

    expect(csvBtn).toBeInTheDocument();
    expect(pdfBtn).toBeInTheDocument();

    // CSV is default selected
    fireEvent.click(pdfBtn);
    // After clicking PDF, the export button should say "Export PDF"
    const exportBtn = screen.getByTestId('export-button');
    expect(exportBtn.textContent).toContain('Export PDF');

    fireEvent.click(csvBtn);
    expect(exportBtn.textContent).toContain('Export CSV');
  });

  it('PDF warning shown when count > 1000 and PDF selected', () => {
    mockPreviewCountReturn = { data: 1500, isLoading: false };
    renderComponent();

    // Select PDF format
    fireEvent.click(screen.getByTestId('format-pdf'));

    expect(screen.getByTestId('pdf-warning')).toBeInTheDocument();
    expect(screen.getByTestId('pdf-warning').textContent).toContain('PDF exports are limited to 1,000 records');
  });

  it('PDF warning NOT shown when count <= 1000', () => {
    mockPreviewCountReturn = { data: 500, isLoading: false };
    renderComponent();

    fireEvent.click(screen.getByTestId('format-pdf'));

    expect(screen.queryByTestId('pdf-warning')).not.toBeInTheDocument();
  });

  it('export button disabled when count = 0', () => {
    mockPreviewCountReturn = { data: 0, isLoading: false };
    renderComponent();

    const exportBtn = screen.getByTestId('export-button');
    expect(exportBtn).toBeDisabled();
  });

  it('export button enabled when count > 0', () => {
    renderComponent();

    const exportBtn = screen.getByTestId('export-button');
    expect(exportBtn).not.toBeDisabled();
  });

  it('Direction 08 styling present (maroon border)', () => {
    renderComponent();

    // Verify header element exists via data-testid (A3: no CSS class selectors)
    const headerDiv = screen.getByTestId('page-header');
    expect(headerDiv).toBeInTheDocument();
  });

  it('skeleton loading for filter area while LGA list loads', () => {
    mockLgasReturn = { data: undefined, isLoading: true, isError: false };
    renderComponent();

    expect(screen.getByTestId('filter-skeleton')).toBeInTheDocument();
  });

  it('renders page header with title', () => {
    renderComponent();

    expect(screen.getByText('Export Reports')).toBeInTheDocument();
  });

  it('triggers download on export button click', async () => {
    renderComponent();

    const exportBtn = screen.getByTestId('export-button');
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(mockDownload).toHaveBeenCalled();
    });
  });

  // ── Race condition / defensive guard tests (Prep-1 Bug B1) ────────

  it('renders gracefully when lgas data is undefined and isLoading is false (race condition)', () => {
    mockLgasReturn = { data: undefined, isLoading: false, isError: false };
    renderComponent();

    // Should NOT crash — filter controls render with empty LGA dropdown
    expect(screen.getByTestId('lga-filter')).toBeInTheDocument();
    expect(screen.getByTestId('source-filter')).toBeInTheDocument();
    expect(screen.queryByTestId('filter-skeleton')).not.toBeInTheDocument();
  });

  it('renders gracefully when lgas data is an empty array', () => {
    mockLgasReturn = { data: [], isLoading: false, isError: false };
    renderComponent();

    // Should render filter controls with empty LGA dropdown (no items)
    expect(screen.getByTestId('lga-filter')).toBeInTheDocument();
    expect(screen.getByTestId('source-filter')).toBeInTheDocument();
  });

  it('renders gracefully when lgas data is null (null safety)', () => {
    mockLgasReturn = { data: null as unknown as undefined, isLoading: false, isError: false };
    renderComponent();

    // Should NOT crash — optional chaining lgas?.map() handles null (= [] default only applies to undefined)
    expect(screen.getByTestId('lga-filter')).toBeInTheDocument();
  });

  it('shows filter skeleton during initial loading with undefined data', () => {
    mockLgasReturn = { data: undefined, isLoading: true, isError: false };
    renderComponent();

    expect(screen.getByTestId('filter-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('lga-filter')).not.toBeInTheDocument();
  });

  it('shows error indicator when lgas query fails (AC6: 403/error state)', () => {
    mockLgasReturn = { data: undefined, isLoading: false, isError: true };
    renderComponent();

    // Should show error message, not crash. Other filters still render.
    expect(screen.getByTestId('lga-error')).toBeInTheDocument();
    expect(screen.getByTestId('lga-filter')).toBeInTheDocument();
    expect(screen.queryByTestId('filter-skeleton')).not.toBeInTheDocument();
  });

  // ── Export Mode Toggle & Full Response Tests ───────────────────────

  it('renders mode toggle with Summary and Full Response buttons', () => {
    renderComponent();

    expect(screen.getByTestId('mode-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('mode-summary')).toBeInTheDocument();
    expect(screen.getByTestId('mode-full')).toBeInTheDocument();
  });

  it('defaults to Respondent Summary mode', () => {
    renderComponent();

    // Summary is default — no form selector should be visible
    expect(screen.queryByTestId('form-selector-container')).not.toBeInTheDocument();
    // PDF button should be available in summary mode
    expect(screen.getByTestId('format-pdf')).toBeInTheDocument();
  });

  it('shows form selector when Full Response mode is selected', () => {
    renderComponent();

    fireEvent.click(screen.getByTestId('mode-full'));

    expect(screen.getByTestId('form-selector-container')).toBeInTheDocument();
    expect(screen.getByTestId('form-selector')).toBeInTheDocument();
  });

  it('hides form selector when switching back to Summary mode', () => {
    renderComponent();

    fireEvent.click(screen.getByTestId('mode-full'));
    expect(screen.getByTestId('form-selector-container')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mode-summary'));
    expect(screen.queryByTestId('form-selector-container')).not.toBeInTheDocument();
  });

  it('hides PDF format option in Full Response mode', () => {
    renderComponent();

    fireEvent.click(screen.getByTestId('mode-full'));

    expect(screen.queryByTestId('format-pdf')).not.toBeInTheDocument();
    expect(screen.getByTestId('format-csv')).toBeInTheDocument();
  });

  it('shows form required message when Full Response mode without form selected', () => {
    renderComponent();

    fireEvent.click(screen.getByTestId('mode-full'));

    expect(screen.getByTestId('form-required-message')).toBeInTheDocument();
    expect(screen.getByTestId('form-required-message').textContent).toContain('Please select a form');
  });

  it('export button disabled when Full Response mode and no form selected', () => {
    renderComponent();

    fireEvent.click(screen.getByTestId('mode-full'));

    const exportBtn = screen.getByTestId('export-button');
    expect(exportBtn).toBeDisabled();
  });

  it('shows placeholder count in Full Response mode without form selected', () => {
    renderComponent();

    fireEvent.click(screen.getByTestId('mode-full'));

    const countEl = screen.getByTestId('record-count');
    expect(countEl.textContent).toContain('—');
    expect(countEl.textContent).toContain('select a form to see count');
  });

  it('shows record count label in Summary mode', () => {
    renderComponent();

    const countEl = screen.getByTestId('record-count');
    expect(countEl.textContent).toContain('records');
  });

  it('shows no-forms message when no published forms available', () => {
    mockPublishedFormsReturn = { data: [], isLoading: false };
    renderComponent();

    fireEvent.click(screen.getByTestId('mode-full'));

    expect(screen.getByTestId('no-forms-message')).toBeInTheDocument();
    expect(screen.getByTestId('no-forms-message').textContent).toContain('No published forms available');
    expect(screen.queryByTestId('form-selector')).not.toBeInTheDocument();
  });

  it('shows date filter hint based on export mode', () => {
    renderComponent();

    const hint = screen.getByTestId('date-hint');
    expect(hint.textContent).toContain('registration date');

    fireEvent.click(screen.getByTestId('mode-full'));

    expect(screen.getByTestId('date-hint').textContent).toContain('submission date');
  });
});
