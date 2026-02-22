/**
 * Export Service Performance Tests
 *
 * Tests actual PDF and CSV generation (no mocks) at various row counts.
 * Measures generation time, output size, and memory usage.
 *
 * Gated behind BENCHMARK env variable — skipped in normal CI.
 * Run with: BENCHMARK=1 pnpm vitest run export.performance
 */

import { describe, it, expect } from 'vitest';
import { ExportService } from '../export.service.js';
import { benchmarkColumns, generateRows } from './export.test-helpers.js';

const runBenchmarks = !!process.env.BENCHMARK;
const describeOrSkip = runBenchmarks ? describe : describe.skip;

describeOrSkip('ExportService Performance', () => {
  describe('PDF generation benchmarks', () => {
    it('should generate PDF with 100 rows under 2s', async () => {
      const data = generateRows(100);
      const start = performance.now();
      const result = await ExportService.generatePdfReport(data, benchmarkColumns, { title: 'Benchmark 100' });
      const elapsed = performance.now() - start;

      console.log(`PDF 100 rows: ${elapsed.toFixed(0)}ms, size: ${(result.length / 1024).toFixed(0)}KB`);
      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
      expect(elapsed).toBeLessThan(2000);
    });

    it('should generate PDF with 1000 rows under 5s', async () => {
      const data = generateRows(1000);
      const start = performance.now();
      const result = await ExportService.generatePdfReport(data, benchmarkColumns, { title: 'Benchmark 1K' });
      const elapsed = performance.now() - start;

      console.log(`PDF 1000 rows: ${elapsed.toFixed(0)}ms, size: ${(result.length / 1024).toFixed(0)}KB`);
      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
      expect(elapsed).toBeLessThan(5000);
    });
  });

  describe('CSV generation benchmarks', () => {
    it('should generate CSV with 100 rows under 100ms', async () => {
      const data = generateRows(100);
      const start = performance.now();
      const result = await ExportService.generateCsvExport(data, benchmarkColumns);
      const elapsed = performance.now() - start;

      console.log(`CSV 100 rows: ${elapsed.toFixed(0)}ms, size: ${(result.length / 1024).toFixed(0)}KB`);
      expect(result).toBeInstanceOf(Buffer);
      expect(elapsed).toBeLessThan(100);
    });

    it('should generate CSV with 1000 rows under 200ms', async () => {
      const data = generateRows(1000);
      const start = performance.now();
      const result = await ExportService.generateCsvExport(data, benchmarkColumns);
      const elapsed = performance.now() - start;

      console.log(`CSV 1000 rows: ${elapsed.toFixed(0)}ms, size: ${(result.length / 1024).toFixed(0)}KB`);
      expect(result).toBeInstanceOf(Buffer);
      expect(elapsed).toBeLessThan(200);
    });

    it('should generate CSV with 10000 rows under 500ms', async () => {
      const data = generateRows(10000);
      const start = performance.now();
      const result = await ExportService.generateCsvExport(data, benchmarkColumns);
      const elapsed = performance.now() - start;

      console.log(`CSV 10000 rows: ${elapsed.toFixed(0)}ms, size: ${(result.length / 1024).toFixed(0)}KB`);
      expect(result).toBeInstanceOf(Buffer);
      expect(elapsed).toBeLessThan(500);
    });
  });
});
