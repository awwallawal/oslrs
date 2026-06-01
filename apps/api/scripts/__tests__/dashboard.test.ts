/**
 * Story 9-19 AC#D1 — Part A CLI helper unit tests.
 *
 * Covers the pure helpers the CLI owns/re-exports: threshold→status mapping
 * (`opsStatusLevel` + the `statusIcon` colour wrapper), the `humanDuration`
 * formatter, and the AC#B1 single-source-of-truth guarantee (the CLI's `T`
 * IS the shared `OPS_THRESHOLDS`).
 *
 * Importing `dashboard.ts` is side-effect-free: its `main()` only runs when the
 * file is executed directly, so this import does NOT touch DB/Redis.
 */
import { describe, it, expect } from 'vitest';
import { OPS_THRESHOLDS, opsStatusLevel as sharedStatusLevel } from '@oslsr/types';
import { T, opsStatusLevel, statusIcon } from '../dashboard.js';
import { humanDuration } from '../../src/services/operations.service.js';

const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';

describe('dashboard CLI — shared threshold source of truth (AC#B1)', () => {
  it('re-exports the SAME OPS_THRESHOLDS object (no drift possible)', () => {
    expect(T).toBe(OPS_THRESHOLDS);
    expect(opsStatusLevel).toBe(sharedStatusLevel);
  });
});

describe('opsStatusLevel — threshold tiering', () => {
  it('returns green below yellow edge', () => {
    expect(opsStatusLevel(10, 30, 50)).toBe('green');
  });
  it('returns yellow at/above yellow edge but below red', () => {
    expect(opsStatusLevel(30, 30, 50)).toBe('yellow');
    expect(opsStatusLevel(49, 30, 50)).toBe('yellow');
  });
  it('returns red at/above red edge', () => {
    expect(opsStatusLevel(50, 30, 50)).toBe('red');
    expect(opsStatusLevel(99, 30, 50)).toBe('red');
  });
  it('supports inverse mode (lower is worse)', () => {
    // headroom: 5 free is critical, 80 free is healthy
    expect(opsStatusLevel(5, 50, 20, true)).toBe('red');
    expect(opsStatusLevel(80, 50, 20, true)).toBe('green');
  });
});

describe('statusIcon — colour wrapper', () => {
  it('paints the dot red/yellow/green per tier', () => {
    expect(statusIcon(90, 60, 80)).toContain(RED);
    expect(statusIcon(65, 60, 80)).toContain(YELLOW);
    expect(statusIcon(10, 60, 80)).toContain(GREEN);
  });
});

describe('humanDuration', () => {
  it('formats sub-hour durations as minutes', () => {
    expect(humanDuration(5 * 60 * 1000)).toBe('5m');
  });
  it('formats sub-day durations as hours + minutes', () => {
    expect(humanDuration((2 * 3600 + 15 * 60) * 1000)).toBe('2h 15m');
  });
  it('formats multi-day durations as days + hours', () => {
    expect(humanDuration((3 * 86400 + 4 * 3600) * 1000)).toBe('3d 4h');
  });
});
