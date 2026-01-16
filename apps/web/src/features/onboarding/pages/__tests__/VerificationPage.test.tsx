// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { screen, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { Route, Routes } from 'react-router-dom';
// @ts-ignore
import VerificationPage from '../VerificationPage';
import { renderWithRouter } from '../../../../test/utils/renderWithRouter';

expect.extend(matchers);

globalThis.fetch = vi.fn();

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('VerificationPage', () => {
    it('should display valid staff details', async () => {
        const mockData = {
            data: {
                fullName: 'Test Staff',
                role: 'Enumerator',
                lga: 'Test LGA',
                status: 'active',
                photoUrl: 'https://photo.com/test.jpg',
                verifiedAt: '2024-01-01T00:00:00Z'
            }
        };

        (globalThis.fetch as any).mockResolvedValue({
            ok: true,
            json: async () => mockData
        });

        renderWithRouter(
            <Routes>
                <Route path="/verify-staff/:id" element={<VerificationPage />} />
            </Routes>,
            { route: '/verify-staff/123' }
        );

        expect(screen.getByText(/verifying/i)).toBeInTheDocument();

        await waitFor(() => {
            expect(screen.getByText('Test Staff')).toBeInTheDocument();
            expect(screen.getByText('Enumerator')).toBeInTheDocument();
            expect(screen.getByText('Test LGA')).toBeInTheDocument();
            expect(screen.getByText(/verified active/i)).toBeInTheDocument();
        });
        
        const img = screen.getByRole('img', { name: /test staff/i });
        expect(img).toHaveAttribute('src', 'https://photo.com/test.jpg');
    });

    it('should handle invalid staff', async () => {
        (globalThis.fetch as any).mockResolvedValue({
            ok: false,
            status: 404,
            json: async () => ({ message: 'Not found' })
        });

        renderWithRouter(
            <Routes>
                <Route path="/verify-staff/:id" element={<VerificationPage />} />
            </Routes>,
            { route: '/verify-staff/invalid' }
        );

        await waitFor(() => {
            expect(screen.getByText(/not found/i)).toBeInTheDocument();
        });
    });
});
