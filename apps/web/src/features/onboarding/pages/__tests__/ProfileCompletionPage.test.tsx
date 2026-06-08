// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';

expect.extend(matchers);

// F-004 (Story 9-42): the selfie upload reads the IN-MEMORY access token from
// auth context, NOT localStorage. Mock useAuth to supply it the in-memory way.
vi.mock('../../../auth/context/AuthContext', () => ({
  useAuth: () => ({ accessToken: 'mem-token' }),
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
// Stub the lazy camera component to immediately surface an onCapture trigger.
vi.mock('../../components/LiveSelfieCapture', () => ({
  default: ({ onCapture }: { onCapture: (f: File) => void }) => (
    <button onClick={() => onCapture(new File(['img'], 'selfie.jpg', { type: 'image/jpeg' }))}>
      trigger-capture
    </button>
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

    render(<ProfileCompletionPage />);

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
