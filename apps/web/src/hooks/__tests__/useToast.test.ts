// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { toast as sonnerToast } from 'sonner';

import { useToast, TOAST_CONFIG } from '../useToast';

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

describe('useToast', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('TOAST_CONFIG', () => {
    it('has correct success duration', () => {
      expect(TOAST_CONFIG.SUCCESS_DURATION).toBe(3000);
    });

    it('has correct error duration', () => {
      expect(TOAST_CONFIG.ERROR_DURATION).toBe(5000);
    });

    it('has max visible toasts set to 3', () => {
      expect(TOAST_CONFIG.MAX_VISIBLE).toBe(3);
    });
  });

  describe('success', () => {
    it('calls sonner success with correct parameters', () => {
      const { result } = renderHook(() => useToast());

      result.current.success({ message: 'Success!' });

      expect(sonnerToast.success).toHaveBeenCalledWith('Success!', {
        description: undefined,
        duration: 3000,
      });
    });

    it('passes description to sonner', () => {
      const { result } = renderHook(() => useToast());

      result.current.success({
        message: 'Success!',
        description: 'Your changes have been saved.',
      });

      expect(sonnerToast.success).toHaveBeenCalledWith('Success!', {
        description: 'Your changes have been saved.',
        duration: 3000,
      });
    });
  });

  describe('error', () => {
    it('calls sonner error with 5s duration', () => {
      const { result } = renderHook(() => useToast());

      result.current.error({ message: 'Error occurred' });

      expect(sonnerToast.error).toHaveBeenCalledWith('Error occurred', {
        description: undefined,
        duration: 5000,
      });
    });
  });

  describe('warning', () => {
    it('calls sonner warning', () => {
      const { result } = renderHook(() => useToast());

      result.current.warning({ message: 'Warning!' });

      expect(sonnerToast.warning).toHaveBeenCalledWith('Warning!', {
        description: undefined,
        duration: 4000,
      });
    });
  });

  describe('info', () => {
    it('calls sonner info', () => {
      const { result } = renderHook(() => useToast());

      result.current.info({ message: 'FYI' });

      expect(sonnerToast.info).toHaveBeenCalledWith('FYI', {
        description: undefined,
        duration: 3000,
      });
    });
  });

  describe('loading', () => {
    it('calls sonner loading', () => {
      const { result } = renderHook(() => useToast());

      result.current.loading({ message: 'Loading...' });

      expect(sonnerToast.loading).toHaveBeenCalledWith('Loading...', {
        description: undefined,
      });
    });
  });

  describe('dismiss', () => {
    it('calls sonner dismiss', () => {
      const { result } = renderHook(() => useToast());

      result.current.dismiss('toast-id');

      expect(sonnerToast.dismiss).toHaveBeenCalledWith('toast-id');
    });

    it('calls sonner dismiss without ID', () => {
      const { result } = renderHook(() => useToast());

      result.current.dismiss();

      expect(sonnerToast.dismiss).toHaveBeenCalledWith(undefined);
    });
  });

  describe('promise', () => {
    it('calls sonner promise', async () => {
      const { result } = renderHook(() => useToast());
      const testPromise = Promise.resolve('data');

      result.current.promise(testPromise, {
        loading: 'Loading...',
        success: 'Done!',
        error: 'Failed!',
      });

      expect(sonnerToast.promise).toHaveBeenCalledWith(testPromise, {
        loading: 'Loading...',
        success: 'Done!',
        error: 'Failed!',
      });
    });
  });
});
