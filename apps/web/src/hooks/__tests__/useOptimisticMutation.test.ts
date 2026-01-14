// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { toast as sonnerToast } from 'sonner';

import { useOptimisticMutation } from '../useOptimisticMutation';

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
    promise: vi.fn(),
  },
}));

// Create wrapper with QueryClient
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useOptimisticMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns isPending as false initially', () => {
    const { result } = renderHook(
      () =>
        useOptimisticMutation({
          mutationFn: async () => 'data',
        }),
      { wrapper: createWrapper() }
    );

    expect(result.current.isPending).toBe(false);
  });

  it('sets isPending to true during mutation', async () => {
    let resolvePromise: (value: string) => void;
    const promise = new Promise<string>((resolve) => {
      resolvePromise = resolve;
    });

    const { result } = renderHook(
      () =>
        useOptimisticMutation({
          mutationFn: () => promise,
        }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.mutate(undefined);
    });

    // isPending should be true during mutation
    await waitFor(() => {
      expect(result.current.isPending).toBe(true);
    });

    await act(async () => {
      resolvePromise!('done');
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });
  });

  it('shows success toast on successful mutation', async () => {
    const { result } = renderHook(
      () =>
        useOptimisticMutation({
          mutationFn: async () => 'data',
          successMessage: 'Custom success!',
        }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.mutate(undefined);
    });

    await waitFor(() => {
      expect(sonnerToast.success).toHaveBeenCalledWith('Custom success!', expect.any(Object));
    });
  });

  it('shows error toast on failed mutation', async () => {
    const { result } = renderHook(
      () =>
        useOptimisticMutation({
          mutationFn: async () => {
            throw new Error('Test error');
          },
          errorMessage: 'Custom error!',
        }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.mutate(undefined);
    });

    await waitFor(() => {
      expect(sonnerToast.error).toHaveBeenCalledWith('Custom error!', expect.any(Object));
    });
  });

  it('supports custom error message function', async () => {
    const { result } = renderHook(
      () =>
        useOptimisticMutation({
          mutationFn: async () => {
            throw new Error('Specific error');
          },
          errorMessage: (error: Error) => `Failed: ${error.message}`,
        }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.mutate(undefined);
    });

    await waitFor(() => {
      expect(sonnerToast.error).toHaveBeenCalledWith('Failed: Specific error', expect.any(Object));
    });
  });

  it('can disable success toast', async () => {
    const { result } = renderHook(
      () =>
        useOptimisticMutation({
          mutationFn: async () => 'data',
          successMessage: false,
        }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.mutate(undefined);
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(sonnerToast.success).not.toHaveBeenCalled();
  });

  it('can disable error toast', async () => {
    const { result } = renderHook(
      () =>
        useOptimisticMutation({
          mutationFn: async () => {
            throw new Error('Test error');
          },
          errorMessage: false,
        }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.mutate(undefined);
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(sonnerToast.error).not.toHaveBeenCalled();
  });

  it('calls onMutate for optimistic updates', async () => {
    const onMutate = vi.fn().mockResolvedValue({ previousData: 'old' });

    const { result } = renderHook(
      () =>
        useOptimisticMutation({
          mutationFn: async () => 'data',
          onMutate,
        }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.mutate('input');
    });

    await waitFor(() => {
      expect(onMutate).toHaveBeenCalledWith('input');
    });
  });

  it('calls onError with context for rollback', async () => {
    const onMutate = vi.fn().mockResolvedValue({ previousData: 'old' });
    const onError = vi.fn();

    const { result } = renderHook(
      () =>
        useOptimisticMutation({
          mutationFn: async () => {
            throw new Error('Test error');
          },
          onMutate,
          onError,
        }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.mutate('input');
    });

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(
        expect.any(Error),
        'input',
        { previousData: 'old' }
      );
    });
  });

  it('calls onSuccess callback', async () => {
    const onSuccess = vi.fn();

    const { result } = renderHook(
      () =>
        useOptimisticMutation({
          mutationFn: async () => 'result',
          onSuccess,
        }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.mutate('input');
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith('result', 'input', undefined);
    });
  });

  it('returns data on success', async () => {
    const { result } = renderHook(
      () =>
        useOptimisticMutation({
          mutationFn: async () => ({ id: 1, name: 'Test' }),
        }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.mutate(undefined);
    });

    await waitFor(() => {
      expect(result.current.data).toEqual({ id: 1, name: 'Test' });
    });
  });

  it('returns error on failure', async () => {
    const testError = new Error('Test error');

    const { result } = renderHook(
      () =>
        useOptimisticMutation({
          mutationFn: async () => {
            throw testError;
          },
        }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.mutate(undefined);
    });

    await waitFor(() => {
      expect(result.current.error).toEqual(testError);
    });
  });

  it('can reset mutation state', async () => {
    const { result } = renderHook(
      () =>
        useOptimisticMutation({
          mutationFn: async () => 'data',
        }),
      { wrapper: createWrapper() }
    );

    await act(async () => {
      result.current.mutate(undefined);
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    await act(async () => {
      result.current.reset();
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(false);
      expect(result.current.data).toBe(undefined);
    });
  });
});
