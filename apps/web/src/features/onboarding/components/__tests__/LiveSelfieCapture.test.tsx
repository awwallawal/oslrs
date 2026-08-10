// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen, cleanup, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

expect.extend(matchers);

import React from 'react';
import LiveSelfieCapture from '../LiveSelfieCapture';

const { mockDetect } = vi.hoisted(() => {
  return { mockDetect: vi.fn() };
});

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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Mock react-webcam
vi.mock('react-webcam', () => {
  // `__screenshot` lets a test choose what the camera "returns" — a real base64
  // JPEG, or a malformed one — so the decode path can be exercised for real
  // rather than against the placeholder string.
  const Mock: any = React.forwardRef((props: any, ref: any) => {
      React.useImperativeHandle(ref, () => ({
        video: document.createElement('video'), // Mock video element
        getScreenshot: () => Mock.__screenshot ?? 'data:image/jpeg;base64,fake',
      }));
      return (
        <div data-testid="webcam-mock">
          Webcam Mock
          <button onClick={props.onUserMedia}>Simulate UserMedia</button>
        </div>
      );
  });
  return { default: Mock };
});

// Mock human
vi.mock('@vladmandic/human', () => {
  return {
    default: class Human {
      load = vi.fn().mockResolvedValue(true);
      detect = mockDetect;
      warmup = vi.fn().mockResolvedValue(true);
    },
  };
});

describe('LiveSelfieCapture', () => {
  beforeEach(() => {
    // Default: 1 face
    mockDetect.mockResolvedValue({ face: [{ box: [0, 0, 100, 100], score: 0.99 }] });
  });

  it('should render camera feed', async () => {
    await act(async () => {
      render(<LiveSelfieCapture onCapture={() => {}} />);
    });
    expect(screen.getByTestId('webcam-mock')).toBeDefined();
  });

  it('should show capture button', async () => {
    await act(async () => {
      render(<LiveSelfieCapture onCapture={() => {}} />);
    });
    expect(await screen.findByRole('button', { name: /capture/i })).toBeDefined();
  });

  it('should disable capture button when no face detected', async () => {
    mockDetect.mockResolvedValue({ face: [] }); // 0 faces
    await act(async () => {
        render(<LiveSelfieCapture onCapture={() => {}} />);
    });
    
    // Wait for button to be disabled (it starts disabled due to loading, then stays disabled due to 0 faces)
    const button = await screen.findByRole('button', { name: /capture/i });
    
    // Wait for "No face detected" to ensure detection ran
    await waitFor(() => {
        expect(screen.getByText(/No face detected/i)).toBeInTheDocument();
    });
    
    expect(button).toBeDisabled();
  });

  it('should enable capture button when one face detected', async () => {
    mockDetect.mockResolvedValue({ face: [{ box: [0, 0, 100, 100], score: 0.99 }] }); // 1 face
    await act(async () => {
        render(<LiveSelfieCapture onCapture={() => {}} />);
    });
    
    const button = await screen.findByRole('button', { name: /capture/i });
    // Wait for model loading to finish and face to be detected
    await waitFor(() => {
        expect(button).toBeEnabled();
    });
    
    expect(screen.getByText(/Face detected/i)).toBeInTheDocument();
  });

  /*
   * ── The submit path. Added 2026-08-10 after a PROD outage. ────────────────────
   *
   * The four tests above are green, were green throughout, and NONE of them clicks
   * "Use Photo". The entire submit path was untested — which is how this shipped:
   *
   *   confirm() did `await fetch(capturedImage)` on a `data:` URL. `fetch()` of a
   *   `data:` URL is governed by CSP connect-src, which did not list `data:`. It
   *   threw, there was no try/catch, the rejection was unhandled, and the button
   *   was inert with no message and no log. No enumerator could submit a selfie,
   *   therefore none could get an ID card. CSP is reportOnly outside production
   *   (app.ts), so this could not reproduce anywhere we test.
   *
   * pattern-test-that-passes-over-a-hole. The question to ask of the tests above
   * was "would any of these fail if the submit button did nothing at all?" — no.
   */
  describe('Use Photo (the path that broke on prod)', () => {
    it('hands onCapture a real File built WITHOUT fetch', async () => {
      // A 1x1 JPEG, so the decode has something truthful to work on.
      const realJpegB64 =
        '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
        'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
        'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
      const { default: Webcam } = await import('react-webcam');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (Webcam as any).__screenshot = `data:image/jpeg;base64,${realJpegB64}`;

      // ⚠️ THE REGRESSION GUARD. Not decoration: if anyone reintroduces
      // `fetch(dataUrl)` here, this spy records the call and the assertion below
      // reds — on a machine where CSP is not even enforced. That is the whole
      // point; the production failure was invisible to every environment we run.
      const fetchSpy = vi.fn();
      const originalFetch = globalThis.fetch;
      globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

      try {
        const onCapture = vi.fn();
        await act(async () => {
          render(<LiveSelfieCapture onCapture={onCapture} />);
        });

        const captureBtn = await screen.findByRole('button', { name: /capture/i });
        await waitFor(() => expect(captureBtn).toBeEnabled());
        await act(async () => {
          captureBtn.click();
        });

        const useBtn = await screen.findByRole('button', { name: /use photo/i });
        await act(async () => {
          useBtn.click();
        });

        // Assert on the ARTEFACT, not on "no error was thrown": a broken
        // conversion can still call back with an empty File.
        expect(onCapture).toHaveBeenCalledTimes(1);
        const file = onCapture.mock.calls[0][0] as File;
        expect(file).toBeInstanceOf(File);
        expect(file.type).toBe('image/jpeg');
        expect(file.size).toBeGreaterThan(0);

        expect(fetchSpy).not.toHaveBeenCalled();
        // And nothing failed silently.
        expect(screen.queryByRole('alert')).toBeNull();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('SHOWS an error instead of doing nothing when the image cannot be decoded', async () => {
      const { default: Webcam } = await import('react-webcam');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (Webcam as any).__screenshot = 'data:image/jpeg;base64'; // no comma → undecodable

      const onCapture = vi.fn();
      await act(async () => {
        render(<LiveSelfieCapture onCapture={onCapture} />);
      });

      const captureBtn = await screen.findByRole('button', { name: /capture/i });
      await waitFor(() => expect(captureBtn).toBeEnabled());
      await act(async () => {
        captureBtn.click();
      });
      const useBtn = await screen.findByRole('button', { name: /use photo/i });
      await act(async () => {
        useBtn.click();
      });

      // The defect was SILENCE, so silence is what this asserts against.
      expect(onCapture).not.toHaveBeenCalled();
      expect(await screen.findByRole('alert')).toBeInTheDocument();
    });
  });
});
