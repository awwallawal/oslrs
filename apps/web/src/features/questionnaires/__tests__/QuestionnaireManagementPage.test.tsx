// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { renderWithRouter } from '../../../test-utils';

import QuestionnaireManagementPage from '../pages/QuestionnaireManagementPage';

expect.extend(matchers);

// Mock the API calls - must return data (not undefined) to avoid TanStack Query warning
vi.mock('../api/questionnaire.api', () => ({
  listQuestionnaires: vi.fn().mockResolvedValue({
    status: 'success',
    data: [],
    meta: { total: 0, page: 1, pageSize: 10, totalPages: 0 },
  }),
  getQuestionnaire: vi.fn().mockResolvedValue({ status: 'success', data: {} }),
  uploadQuestionnaire: vi.fn(),
  updateQuestionnaireStatus: vi.fn(),
  deleteQuestionnaire: vi.fn(),
  getDownloadUrl: vi.fn().mockReturnValue('/api/v1/questionnaires/test/download'),
}));

function renderPage() {
  return renderWithRouter(<QuestionnaireManagementPage />);
}

describe('QuestionnaireManagementPage', () => {
  it('renders the page heading', () => {
    renderPage();
    expect(screen.getByText('Questionnaire Management')).toBeInTheDocument();
  });

  it('renders the upload section', () => {
    renderPage();
    expect(screen.getByText('Upload XLSForm')).toBeInTheDocument();
  });

  it('renders the form versions section', () => {
    renderPage();
    expect(screen.getByText('Form Versions')).toBeInTheDocument();
  });

  it('displays drag-and-drop hint text', () => {
    renderPage();
    expect(
      screen.getByText(/Drag & drop an XLSForm file/i)
    ).toBeInTheDocument();
  });

  it('displays file type hint', () => {
    renderPage();
    expect(screen.getByText(/\.xlsx and \.xml/i)).toBeInTheDocument();
  });
});
