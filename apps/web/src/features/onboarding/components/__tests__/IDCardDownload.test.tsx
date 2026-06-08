// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React from 'react';
import IDCardDownload from '../IDCardDownload';
import { mockDownload } from '../../../../test/mocks/download';

expect.extend(matchers);

// Mock global fetch
globalThis.fetch = vi.fn();

// F-004 (Story 9-42): the component now reads the access token from the in-memory
// auth context (useAuth), NOT localStorage. Mock useAuth so the token is supplied
// the same way the real app supplies it (in memory), and so the component no
// longer depends on any localStorage key.
const mockUseAuth = vi.fn(() => ({ accessToken: 'fake-token' as string | null }));
vi.mock('../../../auth/context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks(); // Important to restore mocks created by mockDownload
  mockUseAuth.mockReturnValue({ accessToken: 'fake-token' });
});

describe('IDCardDownload', () => {
    it('should render download button', () => {
        render(<IDCardDownload />);
        expect(screen.getByRole('button', { name: /download id card/i })).toBeInTheDocument();
    });

    it('should handle download process', async () => {
        const { click, createObjectURL, revokeObjectURL } = mockDownload();

        const mockBlob = new Blob(['%PDF-MOCK'], { type: 'application/pdf' });
        (globalThis.fetch as any).mockResolvedValue({
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
            expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/v1/users/id-card'), expect.anything());
        });

        // F-004: the Authorization header must carry the IN-MEMORY token (from
        // useAuth), proving the component no longer depends on localStorage.
        expect(globalThis.fetch).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                headers: expect.objectContaining({ Authorization: 'Bearer fake-token' }),
            }),
        );

        await waitFor(() => {
            expect(button).toBeEnabled();
            expect(screen.queryByText(/generating/i)).not.toBeInTheDocument();
        });

        expect(createObjectURL).toHaveBeenCalledTimes(1);
        expect(createObjectURL).toHaveBeenCalledWith(mockBlob);
        expect(click).toHaveBeenCalledTimes(1);
        expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    });

    it('should error when no in-memory token is available (not from localStorage)', async () => {
        mockUseAuth.mockReturnValue({ accessToken: null });
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        render(<IDCardDownload />);
        fireEvent.click(screen.getByRole('button', { name: /download id card/i }));

        await waitFor(() => {
            expect(screen.getByText(/authentication required/i)).toBeInTheDocument();
        });
        // No network call attempted without a token.
        expect(globalThis.fetch).not.toHaveBeenCalled();
        consoleSpy.mockRestore();
    });

    it('should handle error', async () => {
        (globalThis.fetch as any).mockResolvedValue({
            ok: false,
            status: 500,
            json: async () => ({ message: 'Server failed' })
        });
        
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        render(<IDCardDownload />);
        
        const button = screen.getByRole('button', { name: /download id card/i });
        fireEvent.click(button);

        await waitFor(() => {
             expect(globalThis.fetch).toHaveBeenCalled();
        });

        await waitFor(() => {
             expect(button).toBeEnabled();
             // Assuming error message is displayed
             expect(screen.getByText(/server failed/i)).toBeInTheDocument();
        });
        
        consoleSpy.mockRestore();
    });
});
