import { vi } from 'vitest'

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'location', {
    value: {
      ...window.location,
      assign: vi.fn(),
      replace: vi.fn(),
    },
    writable: true,
  })
}
