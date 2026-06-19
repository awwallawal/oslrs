// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { screen, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { Route, Routes } from 'react-router-dom';
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
        
        // F-020 (review M2) — the image is the API photo-proxy built from
        // API_URL + id, NOT the raw URL from the response body (which is now just
        // a presence flag). This resolves against the API in dev and prod alike.
        const img = screen.getByRole('img', { name: /test staff/i });
        expect(img.getAttribute('src')).toMatch(/\/users\/verify\/123\/photo$/);
        expect(img.getAttribute('src')).not.toBe('https://photo.com/test.jpg');
    });

    it('renders no image (placeholder) when photoUrl is null', async () => {
        (globalThis.fetch as any).mockResolvedValue({
            ok: true,
            json: async () => ({
                data: {
                    fullName: 'No Photo Staff', role: 'Clerk', lga: 'LGA', status: 'active',
                    photoUrl: null, verifiedAt: '2024-01-01T00:00:00Z',
                },
            }),
        });

        renderWithRouter(
            <Routes>
                <Route path="/verify-staff/:id" element={<VerificationPage />} />
            </Routes>,
            { route: '/verify-staff/456' },
        );

        await waitFor(() => expect(screen.getByText('No Photo Staff')).toBeInTheDocument());
        expect(screen.queryByRole('img', { name: /no photo staff/i })).not.toBeInTheDocument();
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
