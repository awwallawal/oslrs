// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

expect.extend(matchers);

// F-004 (Story 9-42): the selfie upload reads the IN-MEMORY access token from
// auth context, NOT localStorage. Mock useAuth to supply it the in-memory way.
vi.mock('../../../auth/context/AuthContext', () => ({
  useAuth: () => ({ accessToken: 'mem-token' }),
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
// Stub the lazy camera component to immediately surface an onCapture trigger.
//
// Two buttons since Story 13-60: the live path (no `source` argument — exactly
// what a pre-13-60 caller does, so the default is exercised) and the upload
// fallback, which must carry `source: 'upload'` all the way to the request.
vi.mock('../../components/LiveSelfieCapture', () => ({
  default: ({ onCapture }: { onCapture: (f: File, s?: 'live_capture' | 'upload') => void }) => (
    <>
      <button onClick={() => onCapture(new File(['img'], 'selfie.jpg', { type: 'image/jpeg' }))}>
        trigger-capture
      </button>
      <button
        onClick={() =>
          onCapture(new File(['img'], 'passport.jpg', { type: 'image/jpeg' }), 'upload')
        }
      >
        fire-upload
      </button>
    </>
  ),
}));
vi.mock('../../components/IDCardDownload', () => ({ default: () => <div>id-card-stub</div> }));

import ProfileCompletionPage from '../ProfileCompletionPage';

globalThis.fetch = vi.fn();

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ProfileCompletionPage — F-004 in-memory token', () => {
  it('sends the selfie upload with the in-memory token (Authorization header), not localStorage', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          liveSelfieOriginalUrl: 'https://s3/original.jpg',
          liveSelfieIdCardUrl: 'https://s3/cropped.jpg',
        },
      }),
    });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <ProfileCompletionPage />
      </QueryClientProvider>,
    );

    // intro → selfie step
    fireEvent.click(screen.getByRole('button', { name: /start verification/i }));

    // The (mocked) lazy camera component resolves; click to trigger onCapture.
    const captureBtn = await screen.findByRole('button', { name: /trigger-capture/i });
    fireEvent.click(captureBtn);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/users/selfie'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer mem-token' }),
        }),
      );
    });
  });
});

/**
 * Story 13-60 — the remedy screen.
 *
 * TWO THINGS ARE ASSERTED HERE, AND BOTH ARE ABOUT SILENCE:
 *
 *   1. AC6.2 — `source` is sent, and sent BEFORE the file. Multer populates
 *      `req.body` in transmit order, so a text field behind a multi-megabyte
 *      image can arrive unset. That failure is silent AND permissive: `source`
 *      reads undefined, falls back to `live_capture`, and an uploaded passport
 *      photograph is recorded as a live capture — the one outcome AC6.2 forbids.
 *   2. Review M2 — the profile cache is invalidated on success.
 *      `MissingPhotoBanner` reads the same key with a 5-minute staleTime, so
 *      without this the person returns to the dashboard and is told "your photo
 *      did not save" about the photo they just saved, by the banner that sent
 *      them here.
 */
describe('ProfileCompletionPage — the remedy path (13-60)', () => {
  async function uploadAPhoto() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    render(
      <QueryClientProvider client={queryClient}>
        <ProfileCompletionPage />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /start verification/i }));
    fireEvent.click(await screen.findByRole('button', { name: /fire-upload/i }));
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());

    return { invalidateSpy };
  }

  function mockUploadOk() {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          liveSelfieOriginalUrl: 'staff-photos/original/x.jpg',
          liveSelfieIdCardUrl: 'staff-photos/id-card/x.jpg',
          photoSource: 'upload',
        },
      }),
    });
  }

  it('sends the provenance discriminator BEFORE the file (AC6.2)', async () => {
    mockUploadOk();
    await uploadAPhoto();

    const body = (globalThis.fetch as any).mock.calls[0][1].body as FormData;
    const keys = [...body.keys()];

    expect(body.get('source')).toBe('upload');
    // ⛔ ORDER IS THE ASSERTION. Behind the file, multer may leave req.body
    // unpopulated and the server falls back to 'live_capture'.
    expect(keys.indexOf('source')).toBeLessThan(keys.indexOf('file'));
  });

  it('clears the alarm it just answered — the profile cache is invalidated (review M2)', async () => {
    mockUploadOk();
    const { invalidateSpy } = await uploadAPhoto();

    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['users', 'profile'] }),
    );
  });

  it('does not invalidate when the upload failed — there is nothing to un-say', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'Upload failed' }),
    });

    const { invalidateSpy } = await uploadAPhoto();

    expect(await screen.findByText(/Upload failed/i)).toBeInTheDocument();
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
