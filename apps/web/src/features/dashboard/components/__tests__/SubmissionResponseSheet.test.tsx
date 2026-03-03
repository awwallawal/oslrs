// @vitest-environment jsdom
/**
 * SubmissionResponseSheet Tests
 *
 * Tests for the submission response slide-over panel.
 * Verifies rendering, section display, navigator, loading state, and empty states.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

expect.extend(matchers);

// ── Hoisted mocks ───────────────────────────────────────────────────────────

let mockSubmissionReturn = {
  data: undefined as any,
  isLoading: false,
};
const mockDownloadSubmissionResponseExport = vi.fn();

vi.mock('../../hooks/useRespondent', () => ({
  useSubmissionResponses: () => mockSubmissionReturn,
  respondentKeys: {
    all: ['respondents'],
    submissionResponses: (rid: string, sid: string) => ['respondents', 'submissionResponses', rid, sid],
  },
}));

vi.mock('../../api/respondent.api', () => ({
  downloadSubmissionResponseExport: (...args: unknown[]) =>
    mockDownloadSubmissionResponseExport(...args),
}));

import SubmissionResponseSheet from '../SubmissionResponseSheet';

afterEach(() => {
  cleanup();
});

const mockOnOpenChange = vi.fn();
const mockOnSubmissionChange = vi.fn();

const mockResponseData = {
  submissionId: 'sub-1',
  respondentId: 'resp-1',
  submittedAt: '2026-01-20T14:30:00.000Z',
  source: 'enumerator',
  enumeratorName: 'Jane Doe',
  completionTimeSeconds: 120,
  gpsLatitude: 7.3776,
  gpsLongitude: 3.947,
  fraudSeverity: 'medium',
  fraudScore: 45.5,
  verificationStatus: null,
  formTitle: 'OSLSR Master v3',
  formVersion: '1.0.0',
  sections: [
    {
      title: 'Demographics',
      fields: [
        { label: 'Employment Status', value: 'Wage Earner (Government/Public Sector)' },
        { label: 'Age', value: '35' },
      ],
    },
    {
      title: 'Skills',
      fields: [
        { label: 'Skills Possessed', value: 'Carpentry/Woodwork; Plumbing' },
        { label: 'Monthly Income', value: '' },
      ],
    },
  ],
  siblingSubmissionIds: ['sub-0', 'sub-1', 'sub-2'],
};

function renderSheet(overrides = {}) {
  return render(
    <SubmissionResponseSheet
      open={true}
      onOpenChange={mockOnOpenChange}
      respondentId="resp-1"
      submissionId="sub-1"
      respondentName="Adewale Johnson"
      onSubmissionChange={mockOnSubmissionChange}
      {...overrides}
    />,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('SubmissionResponseSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSubmissionReturn = { data: mockResponseData, isLoading: false };
    mockDownloadSubmissionResponseExport.mockResolvedValue(new Blob(['a,b\n1,2'], { type: 'text/csv' }));
  });

  it('renders sheet with submission metadata when open', () => {
    renderSheet();

    expect(screen.getByTestId('submission-response-sheet')).toBeInTheDocument();
    expect(screen.getByTestId('metadata-card')).toBeInTheDocument();
    expect(screen.getByText('Submission Detail')).toBeInTheDocument();
  });

  it('renders respondent name in description', () => {
    renderSheet();

    expect(screen.getByText(/Adewale Johnson/)).toBeInTheDocument();
  });

  it('renders form sections with human-readable labels', () => {
    renderSheet();

    expect(screen.getByTestId('section-0')).toBeInTheDocument();
    expect(screen.getByTestId('section-1')).toBeInTheDocument();
    expect(screen.getByText('Demographics')).toBeInTheDocument();
    expect(screen.getByText('Skills')).toBeInTheDocument();
    expect(screen.getByText('Wage Earner (Government/Public Sector)')).toBeInTheDocument();
    expect(screen.getByText('Carpentry/Woodwork; Plumbing')).toBeInTheDocument();
  });

  it('shows skeleton when loading', () => {
    mockSubmissionReturn = { data: undefined, isLoading: true };
    renderSheet();

    expect(screen.getByTestId('sheet-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('metadata-card')).not.toBeInTheDocument();
  });

  it('shows dash for empty/null field values', () => {
    renderSheet();

    // Monthly Income has empty value — should show em-dash
    const monthlyIncomeField = screen.getByTestId('field-Monthly Income');
    expect(monthlyIncomeField.textContent).toBe('\u2014');
  });

  it('navigator shows correct X of Y count', () => {
    renderSheet();

    const counter = screen.getByTestId('nav-counter');
    expect(counter.textContent).toBe('2 of 3');
  });

  it('Prev/Next buttons navigate between submissions', () => {
    renderSheet();

    fireEvent.click(screen.getByTestId('nav-next'));
    expect(mockOnSubmissionChange).toHaveBeenCalledWith('sub-2');

    fireEvent.click(screen.getByTestId('nav-prev'));
    expect(mockOnSubmissionChange).toHaveBeenCalledWith('sub-0');
  });

  it('Prev disabled on first submission', () => {
    mockSubmissionReturn = {
      data: { ...mockResponseData, siblingSubmissionIds: ['sub-1', 'sub-2'] },
      isLoading: false,
    };
    renderSheet({ submissionId: 'sub-1' });

    // sub-1 is at index 0 — prev should be disabled
    expect(screen.getByTestId('nav-prev')).toBeDisabled();
    expect(screen.getByTestId('nav-next')).not.toBeDisabled();
  });

  it('Next disabled on last submission', () => {
    mockSubmissionReturn = {
      data: { ...mockResponseData, siblingSubmissionIds: ['sub-0', 'sub-1'] },
      isLoading: false,
    };
    renderSheet({ submissionId: 'sub-1' });

    // sub-1 is at index 1 (last) — next should be disabled
    expect(screen.getByTestId('nav-next')).toBeDisabled();
    expect(screen.getByTestId('nav-prev')).not.toBeDisabled();
  });

  it('shows unavailable message when no sections (legacy form)', () => {
    mockSubmissionReturn = {
      data: { ...mockResponseData, sections: [] },
      isLoading: false,
    };
    renderSheet();

    expect(screen.getByTestId('no-sections')).toBeInTheDocument();
    expect(screen.getByText('Form responses unavailable for this submission')).toBeInTheDocument();
  });

  it('renders metadata fields', () => {
    renderSheet();

    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('120s')).toBeInTheDocument();
    expect(screen.getByText('medium')).toBeInTheDocument();
    expect(screen.getByText('enumerator')).toBeInTheDocument();
  });

  it('triggers CSV export from drawer action', async () => {
    renderSheet();

    fireEvent.click(screen.getByTestId('export-csv'));

    await waitFor(() => {
      expect(mockDownloadSubmissionResponseExport).toHaveBeenCalledWith('resp-1', 'sub-1', 'csv');
    });
  });
});
