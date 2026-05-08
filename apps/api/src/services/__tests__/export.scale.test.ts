/**
 * Export Service Scale Tests — 10K and 100K row benchmarks
 * Used for spike summary performance analysis.
 *
 * Gated behind BENCHMARK env variable — skipped in normal CI.
 * Run with: BENCHMARK=1 pnpm vitest run export.scale
 */

import { describe, it, expect } from 'vitest';
import { ExportService } from '../export.service.js';
import { benchmarkColumns, generateRows } from './export.test-helpers.js';

const runBenchmarks = !!process.env.BENCHMARK;
const describeOrSkip = runBenchmarks ? describe : describe.skip;

describeOrSkip('ExportService Scale Tests', () => {
  it('PDF 10K rows — measures scaling behavior', async () => {
    const data = generateRows(10000);
    const memBefore = process.memoryUsage().heapUsed;
    const start = performance.now();
    const result = await ExportService.generatePdfReport(data, benchmarkColumns, { title: 'Scale 10K' });
    const elapsed = performance.now() - start;
    const memAfter = process.memoryUsage().heapUsed;
    const memDeltaMB = (memAfter - memBefore) / (1024 * 1024);

    console.log(`PDF 10K: ${elapsed.toFixed(0)}ms, size: ${(result.length / (1024 * 1024)).toFixed(1)}MB, heap: +${memDeltaMB.toFixed(1)}MB`);
    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);
    // Threshold tightened 2026-05-08 (Story 9-10 2nd-pass review): observed
    // ~17s on developer laptop, was 60000 (3.5× headroom — too generous to
    // catch a 2× regression). 30000 keeps ~1.75× margin over observed which
    // covers slower CI runner hardware variance without masking real slowdowns.
    expect(elapsed).toBeLessThan(30000);
  }, 120000);

  it('CSV 100K rows — measures scaling behavior', async () => {
    const data = generateRows(100000);
    const memBefore = process.memoryUsage().heapUsed;
    const start = performance.now();
    const result = await ExportService.generateCsvExport(data, benchmarkColumns);
    const elapsed = performance.now() - start;
    const memAfter = process.memoryUsage().heapUsed;
    const memDeltaMB = (memAfter - memBefore) / (1024 * 1024);

    console.log(`CSV 100K: ${elapsed.toFixed(0)}ms, size: ${(result.length / (1024 * 1024)).toFixed(1)}MB, heap: +${memDeltaMB.toFixed(1)}MB`);
    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);
    // Threshold tightened 2026-05-08 (Story 9-10 2nd-pass review): observed
    // ~340ms on developer laptop, was 5000 (14.7× headroom — wasteful).
    // 2000 keeps ~5.9× margin over observed; catches a 3× regression while
    // tolerating slow shared CI runners.
    expect(elapsed).toBeLessThan(2000);
  }, 60000);
});
