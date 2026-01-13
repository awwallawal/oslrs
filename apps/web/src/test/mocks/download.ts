import { vi } from 'vitest'

export function mockDownload() {
  const click = vi.fn()
  const revokeObjectURL = vi.fn()
  const createObjectURL = vi.fn(() => 'blob:mock-url')

  vi.spyOn(URL, 'createObjectURL').mockImplementation(createObjectURL)
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revokeObjectURL)

  const originalCreateElement = document.createElement.bind(document)

  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'a') {
      const anchor = originalCreateElement('a')
      anchor.click = click
      // We don't need to mock download/href properties as they are standard on anchor
      // but if we wanted to spy on assignments we could use Object.defineProperty
      
      // Override remove to be spyable if needed, though anchor.remove() is standard
      anchor.remove = vi.fn()
      
      return anchor
    }
    return originalCreateElement(tag)
  })

  return {
    click,
    createObjectURL,
    revokeObjectURL,
  }
}
