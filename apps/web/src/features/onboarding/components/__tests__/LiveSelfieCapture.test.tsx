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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Mock react-webcam
vi.mock('react-webcam', () => {
  return {
    default: React.forwardRef((props: any, ref: any) => {
      React.useImperativeHandle(ref, () => ({
        video: document.createElement('video'), // Mock video element
        getScreenshot: () => 'data:image/jpeg;base64,fake',
      }));
      return (
        <div data-testid="webcam-mock">
          Webcam Mock
          <button onClick={props.onUserMedia}>Simulate UserMedia</button>
        </div>
      );
    }),
  };
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

  it('should render camera feed', () => {
    render(<LiveSelfieCapture onCapture={() => {}} />);
    expect(screen.getByTestId('webcam-mock')).toBeDefined();
  });

  it('should show capture button', async () => {
    render(<LiveSelfieCapture onCapture={() => {}} />);
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
});
