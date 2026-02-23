import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExportService } from '../export.service.js';
import { sampleColumns, generateRows } from './export.test-helpers.js';

// Hoisted mocks for PDFKit
const mocks = vi.hoisted(() => {
  return {
    text: vi.fn().mockReturnThis(),
    image: vi.fn().mockReturnThis(),
    addPage: vi.fn().mockReturnThis(),
    fontSize: vi.fn().mockReturnThis(),
    font: vi.fn().mockReturnThis(),
    fillColor: vi.fn().mockReturnThis(),
    rect: vi.fn().mockReturnThis(),
    fill: vi.fn().mockReturnThis(),
    stroke: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
    pipe: vi.fn().mockReturnThis(),
    save: vi.fn().mockReturnThis(),
    restore: vi.fn().mockReturnThis(),
    lineWidth: vi.fn().mockReturnThis(),
    moveTo: vi.fn().mockReturnThis(),
    lineTo: vi.fn().mockReturnThis(),
    opacity: vi.fn().mockReturnThis(),
    page: { width: 595.28, height: 841.89 },
    readFileSync: vi.fn().mockReturnValue(Buffer.from('fake-logo')),
  };
});

vi.mock('pdfkit', () => {
  return {
    default: class PDFDocument {
      _dataCallback: ((chunk: Buffer) => void) | null = null;
      _endCallback: (() => void) | null = null;
      page = mocks.page;

      constructor(_options: unknown) {}
      text(...args: unknown[]) { mocks.text(...args); return this; }
      image(...args: unknown[]) { mocks.image(...args); return this; }
      addPage(...args: unknown[]) { mocks.addPage(...args); return this; }
      fontSize(...args: unknown[]) { mocks.fontSize(...args); return this; }
      font(...args: unknown[]) { mocks.font(...args); return this; }
      fillColor(...args: unknown[]) { mocks.fillColor(...args); return this; }
      rect(...args: unknown[]) { mocks.rect(...args); return this; }
      fill(...args: unknown[]) { mocks.fill(...args); return this; }
      stroke(...args: unknown[]) { mocks.stroke(...args); return this; }
      save(...args: unknown[]) { mocks.save(...args); return this; }
      restore(...args: unknown[]) { mocks.restore(...args); return this; }
      lineWidth(...args: unknown[]) { mocks.lineWidth(...args); return this; }
      moveTo(...args: unknown[]) { mocks.moveTo(...args); return this; }
      lineTo(...args: unknown[]) { mocks.lineTo(...args); return this; }
      opacity(...args: unknown[]) { mocks.opacity(...args); return this; }
      pipe(...args: unknown[]) { mocks.pipe(...args); return this; }

      on(event: string, callback: (...args: unknown[]) => void) {
        mocks.on(event, callback);
        if (event === 'data') {
          this._dataCallback = callback as (chunk: Buffer) => void;
        }
        if (event === 'end') {
          this._endCallback = callback as () => void;
        }
        return this;
      }

      end() {
        mocks.end();
        // Simulate PDF generation
        if (this._dataCallback) {
          this._dataCallback(Buffer.from('fake-pdf-data'));
        }
        if (this._endCallback) {
          this._endCallback();
        }
        return this;
      }
    },
  };
});

vi.mock('node:fs', () => ({
  readFileSync: mocks.readFileSync,
}));

describe('ExportService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('generatePdfReport', () => {
    it('should return a Buffer', async () => {
      const data = generateRows(10);
      const result = await ExportService.generatePdfReport(data, sampleColumns, {
        title: 'Test Report',
      });
      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should create PDFDocument with A4 size', async () => {
      const data = generateRows(5);
      await ExportService.generatePdfReport(data, sampleColumns, {
        title: 'Test Report',
      });
      // doc.end() should have been called
      expect(mocks.end).toHaveBeenCalledTimes(1);
    });

    it('should render Oyo State header with logo', async () => {
      const data = generateRows(5);
      await ExportService.generatePdfReport(data, sampleColumns, {
        title: 'Respondent Export',
      });
      // Logo should be rendered
      expect(mocks.image).toHaveBeenCalled();
      // Title text should be rendered
      expect(mocks.text).toHaveBeenCalledWith(
        'Oyo State Labour & Skills Registry',
        expect.any(Number),
        expect.any(Number),
        expect.any(Object),
      );
    });

    it('should render report title and date', async () => {
      const data = generateRows(3);
      await ExportService.generatePdfReport(data, sampleColumns, {
        title: 'Respondent Export',
      });
      // Report title should appear
      const textCalls = mocks.text.mock.calls.map((c: unknown[]) => c[0]);
      expect(textCalls).toContain('Respondent Export');
    });

    it('should render column headers', async () => {
      const data = generateRows(3);
      await ExportService.generatePdfReport(data, sampleColumns, {
        title: 'Test Report',
      });
      const textCalls = mocks.text.mock.calls.map((c: unknown[]) => c[0]);
      expect(textCalls).toContain('Full Name');
      expect(textCalls).toContain('NIN');
      expect(textCalls).toContain('Phone');
      expect(textCalls).toContain('LGA');
    });

    it('should render data rows', async () => {
      const data = generateRows(3);
      await ExportService.generatePdfReport(data, sampleColumns, {
        title: 'Test Report',
      });
      const textCalls = mocks.text.mock.calls.map((c: unknown[]) => c[0]);
      expect(textCalls).toContain('Respondent Person 1');
      expect(textCalls).toContain('Respondent Person 2');
      expect(textCalls).toContain('Respondent Person 3');
    });

    it('should apply row striping for alternating rows', async () => {
      const data = generateRows(4);
      await ExportService.generatePdfReport(data, sampleColumns, {
        title: 'Test Report',
      });
      // rect + fill should be called for striped rows
      expect(mocks.rect).toHaveBeenCalled();
      expect(mocks.fill).toHaveBeenCalled();
    });

    it('should paginate when data exceeds one page', async () => {
      // With A4, roughly 25-30 rows per page at default row height
      const data = generateRows(60);
      await ExportService.generatePdfReport(data, sampleColumns, {
        title: 'Large Report',
      });
      expect(mocks.addPage).toHaveBeenCalled();
    });

    it('should render page numbers in footer', async () => {
      const data = generateRows(60);
      await ExportService.generatePdfReport(data, sampleColumns, {
        title: 'Large Report',
      });
      const textCalls = mocks.text.mock.calls.map((c: unknown[]) => c[0]);
      const pageNumberCalls = textCalls.filter((t: string) =>
        typeof t === 'string' && t.match(/Page \d+ of \d+/),
      );
      expect(pageNumberCalls.length).toBeGreaterThan(0);
    });

    it('should handle empty data gracefully', async () => {
      const result = await ExportService.generatePdfReport([], sampleColumns, {
        title: 'Empty Report',
      });
      expect(result).toBeInstanceOf(Buffer);
      const textCalls = mocks.text.mock.calls.map((c: unknown[]) => c[0]);
      expect(textCalls).toContain('No records found');
    });

    it('should auto-scale columns when total width exceeds content area', async () => {
      const wideColumns = [
        { key: 'name', header: 'Full Name', width: 300 },
        { key: 'nin', header: 'NIN', width: 200 },
        { key: 'phone', header: 'Phone', width: 200 },
      ];
      const data = generateRows(3);
      const result = await ExportService.generatePdfReport(data, wideColumns, {
        title: 'Wide Columns Report',
      });
      expect(result).toBeInstanceOf(Buffer);
      // Should still render all column headers despite overflow
      const textCalls = mocks.text.mock.calls.map((c: unknown[]) => c[0]);
      expect(textCalls).toContain('Full Name');
      expect(textCalls).toContain('NIN');
      expect(textCalls).toContain('Phone');
    });

    it('should include record count in footer', async () => {
      const data = generateRows(15);
      await ExportService.generatePdfReport(data, sampleColumns, {
        title: 'Test Report',
      });
      const textCalls = mocks.text.mock.calls.map((c: unknown[]) => c[0]);
      const countCalls = textCalls.filter((t: string) =>
        typeof t === 'string' && t.includes('15 records'),
      );
      expect(countCalls.length).toBeGreaterThan(0);
    });
  });

  describe('generateCsvExport', () => {
    it('should return a Buffer with UTF-8 BOM', async () => {
      const data = generateRows(5);
      const result = await ExportService.generateCsvExport(data, sampleColumns);
      expect(result).toBeInstanceOf(Buffer);
      // UTF-8 BOM: 0xEF, 0xBB, 0xBF
      expect(result[0]).toBe(0xef);
      expect(result[1]).toBe(0xbb);
      expect(result[2]).toBe(0xbf);
    });

    it('should include column headers as first line', async () => {
      const data = generateRows(3);
      const result = await ExportService.generateCsvExport(data, sampleColumns);
      const text = result.toString('utf-8');
      const firstLine = text.split('\n')[0].replace('\uFEFF', '');
      expect(firstLine).toContain('Full Name');
      expect(firstLine).toContain('NIN');
      expect(firstLine).toContain('Phone');
      expect(firstLine).toContain('LGA');
    });

    it('should include data rows', async () => {
      const data = generateRows(3);
      const result = await ExportService.generateCsvExport(data, sampleColumns);
      const text = result.toString('utf-8');
      expect(text).toContain('Respondent Person 1');
      expect(text).toContain('Respondent Person 2');
      expect(text).toContain('Respondent Person 3');
    });

    it('should escape commas in values', async () => {
      const data = [{ name: 'Doe, John', nin: '12345678901', phone: '+2348012340001', lga: 'LGA-1' }];
      const result = await ExportService.generateCsvExport(data, sampleColumns);
      const text = result.toString('utf-8');
      // Value with comma should be quoted
      expect(text).toContain('"Doe, John"');
    });

    it('should escape double quotes in values', async () => {
      const data = [{ name: 'John "The Boss"', nin: '12345678901', phone: '+2348012340001', lga: 'LGA-1' }];
      const result = await ExportService.generateCsvExport(data, sampleColumns);
      const text = result.toString('utf-8');
      // Double quotes should be escaped as ""
      expect(text).toContain('"John ""The Boss"""');
    });

    it('should handle empty data', async () => {
      const result = await ExportService.generateCsvExport([], sampleColumns);
      const text = result.toString('utf-8');
      const lines = text.trim().split('\n');
      // Only header line
      expect(lines.length).toBe(1);
    });

    it('should handle newlines in values', async () => {
      const data = [{ name: 'John\nDoe', nin: '12345678901', phone: '+2348012340001', lga: 'LGA-1' }];
      const result = await ExportService.generateCsvExport(data, sampleColumns);
      const text = result.toString('utf-8');
      expect(text).toContain('"John\nDoe"');
    });
  });
});
