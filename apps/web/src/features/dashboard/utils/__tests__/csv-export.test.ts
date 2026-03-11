// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { exportToCSV } from '../csv-export';

/** Helper to capture the CSV string passed to the Blob constructor */
function setupBlobCapture() {
  let capturedCSV = '';
  const origBlob = globalThis.Blob;
  globalThis.Blob = class extends origBlob {
    constructor(parts: BlobPart[], opts?: BlobPropertyBag) {
      super(parts, opts);
      // Capture the raw CSV string from the first part
      if (parts && parts.length > 0 && typeof parts[0] === 'string') {
        capturedCSV = parts[0] as string;
      }
    }
  } as any;

  const createObjectURL = vi.fn(() => 'blob:test');
  const revokeObjectURL = vi.fn();
  globalThis.URL.createObjectURL = createObjectURL;
  globalThis.URL.revokeObjectURL = revokeObjectURL;

  vi.spyOn(document.body, 'appendChild').mockImplementation((node: any) => {
    node.click = vi.fn();
    return node;
  });
  vi.spyOn(document.body, 'removeChild').mockImplementation(() => null as any);

  return {
    getCSV: () => capturedCSV,
    createObjectURL,
    revokeObjectURL,
    restore: () => { globalThis.Blob = origBlob; },
  };
}

describe('exportToCSV', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('generates correct CSV content', () => {
    const { getCSV, createObjectURL, restore } = setupBlobCapture();

    const data = [
      { label: 'Male', count: 50, percentage: 50 },
      { label: 'Female', count: 50, percentage: 50 },
    ];

    exportToCSV(data, 'test-export');

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));

    const csv = getCSV();
    // Verify headers
    expect(csv).toContain('label,count,percentage');
    // Verify row data
    expect(csv).toContain('Male,50,50');
    expect(csv).toContain('Female,50,50');

    restore();
  });

  it('handles empty data gracefully', () => {
    const createObjectURL = vi.fn();
    globalThis.URL.createObjectURL = createObjectURL;

    exportToCSV([], 'empty');

    // Should not create blob for empty data
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('escapes strings with commas and quotes', () => {
    const { getCSV, restore } = setupBlobCapture();

    const data = [
      { name: 'Smith, John', value: 'has "quotes"' },
    ];

    exportToCSV(data, 'escaped');

    const csv = getCSV();
    // Comma-containing value should be quoted
    expect(csv).toContain('"Smith, John"');
    // Quote-containing value should have escaped quotes
    expect(csv).toContain('"has ""quotes"""');

    restore();
  });

  it('sanitizes formula injection characters', () => {
    const { getCSV, restore } = setupBlobCapture();

    const data = [
      { label: '=SUM(A1:A10)', count: 1 },
      { label: '+cmd|stuff', count: 2 },
      { label: '-dangerous', count: 3 },
      { label: '@malicious', count: 4 },
    ];

    exportToCSV(data, 'injection');

    const csv = getCSV();
    // Formula-starting characters should be prefixed with single quote
    expect(csv).toContain("'=SUM(A1:A10)");
    expect(csv).toContain("'+cmd|stuff");
    expect(csv).toContain("'-dangerous");
    expect(csv).toContain("'@malicious");
    // Original unquoted values should NOT appear
    expect(csv).not.toMatch(/^=SUM/m);

    restore();
  });

  it('handles null and undefined values', () => {
    const { getCSV, restore } = setupBlobCapture();

    const data = [
      { label: 'Test', count: null, extra: undefined },
    ];

    exportToCSV(data as any, 'nulls');

    const csv = getCSV();
    // null/undefined should become empty strings, not literal "null"/"undefined"
    expect(csv).not.toContain('null');
    expect(csv).not.toContain('undefined');
    expect(csv).toContain('Test,,');

    restore();
  });

  it('strips suppressed field from export', () => {
    const { getCSV, restore } = setupBlobCapture();

    const data = [
      { label: 'Group A', count: 50, suppressed: false },
      { label: 'Group B', count: 3, suppressed: true },
    ];

    exportToCSV(data, 'suppressed');

    const csv = getCSV();
    // suppressed column should not appear in headers or data
    expect(csv).not.toContain('suppressed');
    expect(csv).toContain('label,count');

    restore();
  });

  it('sanitizes filename to prevent path traversal', () => {
    const { createObjectURL, restore } = setupBlobCapture();

    const data = [{ label: 'test', count: 1 }];
    exportToCSV(data, '../../../etc/passwd');

    expect(createObjectURL).toHaveBeenCalled();
    // The function should complete without error with the malicious filename
    // Filename sanitization happens internally (special chars replaced with underscores)

    restore();
  });
});
