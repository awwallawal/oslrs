// @vitest-environment jsdom
/**
 * BulkImportModal Tests
 * Story 2.5-3: Code Review - Deferred Tests
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

expect.extend(matchers);

import { renderWithRouter } from '../../../../test-utils';
import { BulkImportModal } from '../BulkImportModal';

// Mock the hooks
const mockMutate = vi.fn();
const mockUseImportStaffCsv = vi.fn(() => ({
  mutate: mockMutate,
  isPending: false,
}));
const mockUseImportStatus = vi.fn(() => ({
  data: null,
}));

vi.mock('../../hooks/useStaff', () => ({
  useImportStaffCsv: () => mockUseImportStaffCsv(),
  useImportStatus: () => mockUseImportStatus(),
}));

describe('BulkImportModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseImportStaffCsv.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    });
    mockUseImportStatus.mockReturnValue({
      data: null,
    });
  });

  describe('Rendering', () => {
    it('renders modal when open', () => {
      renderWithRouter(<BulkImportModal {...defaultProps} />);

      expect(screen.getByText('Bulk Import Staff')).toBeInTheDocument();
    });

    it('renders template download link', () => {
      renderWithRouter(<BulkImportModal {...defaultProps} />);

      // The link text is "Download" with a Download icon
      const downloadLink = screen.getByRole('link', { name: /download/i });
      expect(downloadLink).toHaveAttribute(
        'href',
        '/templates/staff-import-template.csv'
      );
    });

    it('renders drop zone with instructions', () => {
      renderWithRouter(<BulkImportModal {...defaultProps} />);

      expect(screen.getByText(/click to upload/i)).toBeInTheDocument();
    });

    it('renders required columns info', () => {
      renderWithRouter(<BulkImportModal {...defaultProps} />);

      expect(screen.getByText(/required columns/i)).toBeInTheDocument();
    });

    it('renders cancel and import buttons', () => {
      renderWithRouter(<BulkImportModal {...defaultProps} />);

      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /import/i })).toBeInTheDocument();
    });
  });

  describe('File Validation', () => {
    it('shows error for non-CSV file', async () => {
      renderWithRouter(<BulkImportModal {...defaultProps} />);

      const file = new File(['test'], 'test.txt', { type: 'text/plain' });
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;

      fireEvent.change(input, { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByText(/please upload a csv file/i)).toBeInTheDocument();
      });
    });

    it('shows error for file exceeding 5MB', async () => {
      renderWithRouter(<BulkImportModal {...defaultProps} />);

      // Create a file larger than 5MB
      const largeContent = new Array(6 * 1024 * 1024).fill('a').join('');
      const file = new File([largeContent], 'large.csv', { type: 'text/csv' });
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;

      fireEvent.change(input, { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByText(/file size exceeds 5mb/i)).toBeInTheDocument();
      });
    });

    it('accepts valid CSV file', async () => {
      renderWithRouter(<BulkImportModal {...defaultProps} />);

      const file = new File(['name,email\nJohn,john@example.com'], 'staff.csv', {
        type: 'text/csv',
      });
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;

      fireEvent.change(input, { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByText('staff.csv')).toBeInTheDocument();
      });
    });
  });

  describe('Interactions', () => {
    it('calls onClose when cancel button is clicked', () => {
      renderWithRouter(<BulkImportModal {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('disables import button when no file selected', () => {
      renderWithRouter(<BulkImportModal {...defaultProps} />);

      expect(screen.getByRole('button', { name: /import/i })).toBeDisabled();
    });

    it('enables import button when valid file selected', async () => {
      renderWithRouter(<BulkImportModal {...defaultProps} />);

      const file = new File(['name,email\nJohn,john@example.com'], 'staff.csv', {
        type: 'text/csv',
      });
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;

      fireEvent.change(input, { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /import/i })).not.toBeDisabled();
      });
    });

    it('calls mutate when import button clicked with valid file', async () => {
      renderWithRouter(<BulkImportModal {...defaultProps} />);

      const file = new File(['name,email\nJohn,john@example.com'], 'staff.csv', {
        type: 'text/csv',
      });
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;

      fireEvent.change(input, { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /import/i })).not.toBeDisabled();
      });

      fireEvent.click(screen.getByRole('button', { name: /import/i }));

      expect(mockMutate).toHaveBeenCalledWith(file, expect.any(Object));
    });
  });

  describe('Success State', () => {
    it('shows success message when import completes', async () => {
      mockUseImportStatus.mockReturnValue({
        data: {
          data: {
            status: 'completed',
            createdCount: 5,
            skippedCount: 1,
          },
        },
      });

      renderWithRouter(<BulkImportModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Import Complete')).toBeInTheDocument();
      });
    });
  });
});
