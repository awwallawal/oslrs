// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

const { mockFetchFormForRender, mockDbPut, mockDbGet } = vi.hoisted(() => ({
  mockFetchFormForRender: vi.fn(),
  mockDbPut: vi.fn(),
  mockDbGet: vi.fn(),
}));

vi.mock('../../api/form.api', () => ({
  fetchPublishedForms: vi.fn(),
  fetchFormForRender: mockFetchFormForRender,
}));

vi.mock('../../../../lib/offline-db', () => ({
  db: {
    formSchemaCache: {
      put: mockDbPut,
      get: mockDbGet,
    },
    drafts: {
      where: vi.fn().mockReturnValue({
        equals: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([]),
        }),
      }),
    },
  },
}));

import { useFormSchema } from '../useForms';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

const mockSchema = {
  formId: 'form-1',
  title: 'Test Form',
  version: '1.0.0',
  questions: [],
  choiceLists: {},
  sectionShowWhen: {},
};

describe('useFormSchema dual-layer caching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes fetched schema to Dexie on successful online fetch', async () => {
    mockFetchFormForRender.mockResolvedValue(mockSchema);
    mockDbPut.mockResolvedValue(undefined);

    const { result } = renderHook(() => useFormSchema('form-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetchFormForRender).toHaveBeenCalledWith('form-1');
    expect(mockDbPut).toHaveBeenCalledWith(
      expect.objectContaining({
        formId: 'form-1',
        version: '1.0.0',
        cachedAt: expect.any(String),
      })
    );
    expect(result.current.data).toEqual(mockSchema);
  });

  it('falls back to Dexie cache when fetch fails', async () => {
    mockFetchFormForRender.mockRejectedValue(new Error('Network error'));
    mockDbGet.mockResolvedValue({
      formId: 'form-1',
      version: '1.0.0',
      schema: mockSchema,
      cachedAt: '2026-01-01T00:00:00.000Z',
      etag: null,
    });

    const { result } = renderHook(() => useFormSchema('form-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockDbGet).toHaveBeenCalledWith('form-1');
    expect(result.current.data).toEqual(mockSchema);
  });

  it('throws error when fetch fails and no Dexie cache exists', async () => {
    mockFetchFormForRender.mockRejectedValue(new Error('Network error'));
    mockDbGet.mockResolvedValue(undefined);

    const { result } = renderHook(() => useFormSchema('form-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
  });
});
