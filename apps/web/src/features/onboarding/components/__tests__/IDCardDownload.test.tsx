// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React from 'react';
// @ts-ignore - component doesn't exist yet
import IDCardDownload from '../IDCardDownload';
import { mockDownload } from '../../../../test/mocks/download';

expect.extend(matchers);

// Mock global fetch
global.fetch = vi.fn();

// Mock localStorage
const localStorageMock = (function() {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value.toString();
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    })
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks(); // Important to restore mocks created by mockDownload
  localStorageMock.clear();
});

describe('IDCardDownload', () => {
    it('should render download button', () => {
        render(<IDCardDownload />);
        expect(screen.getByRole('button', { name: /download id card/i })).toBeInTheDocument();
    });

    it('should handle download process', async () => {
        const { click, createObjectURL, revokeObjectURL } = mockDownload();
        
        localStorageMock.setItem('token', 'fake-token');
        const mockBlob = new Blob(['%PDF-MOCK'], { type: 'application/pdf' });
        (global.fetch as any).mockResolvedValue({
            ok: true,
            blob: async () => mockBlob,
            headers: {
                get: vi.fn().mockReturnValue('attachment; filename="oslrs-id-card.pdf"')
            }
        });

        render(<IDCardDownload />);
        
        const button = screen.getByRole('button', { name: /download id card/i });
        fireEvent.click(button);

        expect(button).toBeDisabled(); // Loading state
        // Assuming text changes to 'Generating...' or similar
        expect(screen.getByText(/generating/i)).toBeInTheDocument();

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/v1/users/id-card'), expect.anything());
        });

        await waitFor(() => {
            expect(button).toBeEnabled();
            expect(screen.queryByText(/generating/i)).not.toBeInTheDocument();
        });

        expect(createObjectURL).toHaveBeenCalledTimes(1);
        expect(createObjectURL).toHaveBeenCalledWith(mockBlob);
        expect(click).toHaveBeenCalledTimes(1);
        expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    });

    it('should handle error', async () => {
        localStorageMock.setItem('token', 'fake-token');
        (global.fetch as any).mockResolvedValue({
            ok: false,
            status: 500,
            json: async () => ({ message: 'Server failed' })
        });
        
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        render(<IDCardDownload />);
        
        const button = screen.getByRole('button', { name: /download id card/i });
        fireEvent.click(button);

        await waitFor(() => {
             expect(global.fetch).toHaveBeenCalled();
        });

        await waitFor(() => {
             expect(button).toBeEnabled();
             // Assuming error message is displayed
             expect(screen.getByText(/server failed/i)).toBeInTheDocument();
        });
        
        consoleSpy.mockRestore();
    });
});
