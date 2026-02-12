import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

expect.extend(matchers);

import { PreviewTab } from '../PreviewTab';
import type { NativeFormSchema } from '@oslsr/types';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockSchema: NativeFormSchema = {
  id: 'test-form-id',
  title: 'Test Form',
  version: '1.0.0',
  status: 'draft',
  createdAt: '2026-02-10T00:00:00.000Z',
  sections: [
    {
      id: 's1',
      title: 'Section 1',
      questions: [
        {
          id: 'q1',
          name: 'name',
          type: 'text',
          label: 'Name',
          required: true,
        },
      ],
    },
  ],
  choiceLists: {},
};

const emptySchema: NativeFormSchema = {
  id: 'empty-form-id',
  title: 'Empty Form',
  version: '1.0.0',
  status: 'draft',
  createdAt: '2026-02-10T00:00:00.000Z',
  sections: [],
  choiceLists: {},
};

function renderTab(formId?: string, schema = mockSchema) {
  return render(
    <MemoryRouter>
      <PreviewTab schema={schema} formId={formId} />
    </MemoryRouter>
  );
}

describe('PreviewTab', () => {
  it('shows Live Preview button when formId is provided and questions exist', () => {
    renderTab('form-123');
    expect(screen.getByTestId('live-preview-btn')).toBeInTheDocument();
    expect(screen.getByText('Live Preview')).toBeInTheDocument();
  });

  it('hides Live Preview button when formId is not provided', () => {
    renderTab(undefined);
    expect(screen.queryByTestId('live-preview-btn')).not.toBeInTheDocument();
  });

  it('hides Live Preview button when there are no questions', () => {
    renderTab('form-123', emptySchema);
    expect(screen.queryByTestId('live-preview-btn')).not.toBeInTheDocument();
  });

  it('navigates to preview route on click', () => {
    renderTab('form-abc');
    fireEvent.click(screen.getByTestId('live-preview-btn'));
    expect(mockNavigate).toHaveBeenCalledWith(
      '/dashboard/super-admin/questionnaires/form-abc/preview'
    );
  });

  it('displays form statistics and field summary', () => {
    renderTab('form-123');
    expect(screen.getByText('Sections')).toBeInTheDocument();
    expect(screen.getByText('Field Summary')).toBeInTheDocument();
    expect(screen.getByText('JSON Schema')).toBeInTheDocument();
  });
});
