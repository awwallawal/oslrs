// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import QuestionnaireManagementPage from '../pages/QuestionnaireManagementPage';

expect.extend(matchers);

// Mock the API calls
vi.mock('../api/questionnaire.api', () => ({
  listQuestionnaires: vi.fn().mockResolvedValue({
    status: 'success',
    data: [],
    meta: { total: 0, page: 1, pageSize: 10, totalPages: 0 },
  }),
  getQuestionnaire: vi.fn().mockResolvedValue({ status: 'success', data: null }),
  uploadQuestionnaire: vi.fn(),
  updateQuestionnaireStatus: vi.fn(),
  deleteQuestionnaire: vi.fn(),
  getDownloadUrl: vi.fn().mockReturnValue('/api/v1/questionnaires/test/download'),
}));

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('QuestionnaireManagementPage', () => {
  it('renders the page heading', () => {
    renderWithProviders(<QuestionnaireManagementPage />);
    expect(screen.getByText('Questionnaire Management')).toBeInTheDocument();
  });

  it('renders the upload section', () => {
    renderWithProviders(<QuestionnaireManagementPage />);
    expect(screen.getByText('Upload XLSForm')).toBeInTheDocument();
  });

  it('renders the form versions section', () => {
    renderWithProviders(<QuestionnaireManagementPage />);
    expect(screen.getByText('Form Versions')).toBeInTheDocument();
  });

  it('displays drag-and-drop hint text', () => {
    renderWithProviders(<QuestionnaireManagementPage />);
    expect(
      screen.getByText(/Drag & drop an XLSForm file/i)
    ).toBeInTheDocument();
  });

  it('displays file type hint', () => {
    renderWithProviders(<QuestionnaireManagementPage />);
    expect(screen.getByText(/\.xlsx and \.xml/i)).toBeInTheDocument();
  });
});
