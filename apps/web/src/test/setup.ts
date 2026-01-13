import { vi } from 'vitest';
import '@testing-library/jest-dom';

// Global mock for window.location to prevent "Not implemented: navigation to another Document"
Object.defineProperty(window, 'location', {
  value: {
    ...window.location,
    assign: vi.fn(),
    replace: vi.fn(),
  },
  writable: true,
});
