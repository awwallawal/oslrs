/**
 * Story 9-10 — capture-pm2-restart-trajectory.ts unit tests.
 *
 * Targets the pure helpers (no shell-out, no fs side-effects):
 *   - readRestartEvents (parsed via in-memory writeFile workflow)
 *   - correlateDeploys (the deploy-window correlation logic)
 *
 * The CLI plumbing (process.argv parsing, pm2/git execFileSync) is exercised
 * manually on the VPS — no attempt to mock child_process here.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRestartEvents, correlateDeploys, parsePm2Show } from '../capture-pm2-restart-trajectory.js';

describe('readRestartEvents (PM2 daemon log parser)', () => {
  let logPath: string;

  beforeAll(() => {
    const dir = mkdtempSync(join(tmpdir(), '9-10-trajectory-test-'));
    logPath = join(dir, 'pm2.log');
    const sample = [
      '2026-04-25T08:54:37: PM2 log: pm2 has been killed by signal, dumping process list before exit...',
      '2026-04-25T08:54:37: PM2 log: App [oslsr-api:0] exited with code [0] via signal [SIGHUP]',
      '2026-04-25T08:54:37: PM2 log: pid=2398946 msg=process killed',
      '2026-04-27T07:50:54: PM2 log: App [oslsr-api:0] exited with code [0] via signal [SIGINT]',
      '2026-04-27T07:50:54: PM2 log: pid=42163 msg=process killed',
      '2026-05-04T11:11:37: PM2 log: App [oslsr-api:0] exited with code [0] via signal [SIGINT]',
      '2026-05-04T11:11:37: PM2 log: pid=176479 msg=process killed',
      '',
    ].join('\n');
    writeFileSync(logPath, sample, 'utf8');
  });

  it('extracts every "exited with code … via signal" event after --since', () => {
    const events = readRestartEvents(logPath, '2026-04-27T07:30:00Z');
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ iso: '2026-04-27T07:50:54Z', signal: 'SIGINT', pid: '42163' });
    expect(events[1]).toEqual({ iso: '2026-05-04T11:11:37Z', signal: 'SIGINT', pid: '176479' });
  });

  it('honours the --since cutoff (exclusive of older events)', () => {
    const events = readRestartEvents(logPath, '2026-05-01T00:00:00Z');
    expect(events).toHaveLength(1);
    expect(events[0]?.iso).toBe('2026-05-04T11:11:37Z');
  });

  it('captures non-SIGINT signals (e.g. SIGHUP) too — useful for diagnosing crash signatures', () => {
    const events = readRestartEvents(logPath, '2026-04-25T00:00:00Z');
    expect(events.some((e) => e.signal === 'SIGHUP')).toBe(true);
  });
});

describe('correlateDeploys (60-900s deploy window)', () => {
  it('matches a restart 7 minutes after a deploy commit', () => {
    const result = correlateDeploys(
      [{ iso: '2026-04-27T07:50:54Z', signal: 'SIGINT', pid: '42163' }],
      [
        {
          iso: '2026-04-27T07:43:38Z',
          hash: '718f84e',
          subject: 'fix(api): ioredis shutdown crash',
        },
      ],
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.deploy?.hash).toBe('718f84e');
  });

  it('rejects a commit pushed AFTER the restart event (gap < 60s lower bound)', () => {
    const result = correlateDeploys(
      [{ iso: '2026-04-27T07:50:54Z', signal: 'SIGINT', pid: '42163' }],
      [{ iso: '2026-04-27T07:51:00Z', hash: 'aaaaaaa', subject: 'doc: later' }],
    );
    expect(result[0]?.deploy).toBeNull();
  });

  it('rejects a commit pushed >15 minutes before the restart', () => {
    const result = correlateDeploys(
      [{ iso: '2026-04-27T08:00:00Z', signal: 'SIGINT', pid: '42163' }],
      [{ iso: '2026-04-27T07:30:00Z', hash: 'bbbbbbb', subject: 'doc: too early' }],
    );
    expect(result[0]?.deploy).toBeNull();
  });

  it('selects the closest commit when multiple fall in the window', () => {
    const result = correlateDeploys(
      [{ iso: '2026-05-01T10:25:15Z', signal: 'SIGINT', pid: '121566' }],
      [
        { iso: '2026-05-01T10:15:00Z', hash: 'ccccccc', subject: 'older candidate' },
        { iso: '2026-05-01T10:20:30Z', hash: 'ddddddd', subject: 'closer candidate' },
      ],
    );
    expect(result[0]?.deploy?.hash).toBe('ddddddd');
  });

  it('flags spontaneous restarts (no commit in window) with deploy=null', () => {
    const result = correlateDeploys(
      [{ iso: '2026-05-07T03:00:00Z', signal: 'SIGINT', pid: '99999' }],
      [{ iso: '2026-05-06T22:00:00Z', hash: 'eeeeeee', subject: 'previous evening' }],
    );
    expect(result[0]?.deploy).toBeNull();
  });
});

// Story 9-10 review L1: ensure --since accepts non-`Z` ISO offsets.
describe('readRestartEvents — timezone-tolerant --since (L1 fix)', () => {
  let logPath: string;
  beforeAll(() => {
    const dir = mkdtempSync(join(tmpdir(), '9-10-trajectory-tz-'));
    logPath = join(dir, 'pm2.log');
    const sample = [
      '2026-04-27T07:50:54: PM2 log: App [oslsr-api:0] exited with code [0] via signal [SIGINT]',
      '2026-04-27T07:50:54: PM2 log: pid=42163 msg=process killed',
      '',
    ].join('\n');
    writeFileSync(logPath, sample, 'utf8');
  });

  it('accepts `+00:00` form of --since equivalently to `Z`', () => {
    const z = readRestartEvents(logPath, '2026-04-27T07:30:00Z');
    const offset = readRestartEvents(logPath, '2026-04-27T07:30:00+00:00');
    expect(offset).toEqual(z);
    expect(offset).toHaveLength(1);
  });

  it('respects timezone semantics: 09:30+02:00 == 07:30Z', () => {
    // 09:30 in +02:00 = 07:30Z; the 07:50:54Z event is AFTER, should be included.
    const events = readRestartEvents(logPath, '2026-04-27T09:30:00+02:00');
    expect(events).toHaveLength(1);
  });
});

// Story 9-10 review M2: parsePm2Show extracted + relaxed regex.
describe('parsePm2Show (M2 fix — exported helper)', () => {
  it('parses canonical box-drawing PM2 show output', () => {
    const sample = [
      '┌─────────────────────────────────────────────────────────────┐',
      '│ Describing process with id 0 - name oslsr-api               │',
      '├──────────┬──────────────────────────────────────────────────┤',
      '│ status   │ online                                           │',
      '│ restarts │ 24                                               │',
      '│ uptime   │ 12D                                              │',
      '│ created at │ 2026-04-25T08:54:38.000Z                       │',
      '└──────────┴──────────────────────────────────────────────────┘',
    ].join('\n');
    const snap = parsePm2Show(sample);
    expect(snap.restarts).toBe(24);
    expect(snap.uptime).toBe('12D');
    expect(snap.createdAt).toBe('2026-04-25T08:54:38.000Z');
  });

  it('parses ASCII fallback (PM2 versions without box-drawing)', () => {
    // No `│` chars — colon-separated tabular output some PM2 builds emit.
    const sample = [
      'restarts: 7',
      'uptime: 3D',
      'created at: 2026-05-01T00:00:00.000Z',
    ].join('\n');
    const snap = parsePm2Show(sample);
    expect(snap.restarts).toBe(7);
    expect(snap.uptime).toBe('3D');
    expect(snap.createdAt).toBe('2026-05-01T00:00:00.000Z');
  });

  it('returns null fields when PM2 output lacks expected lines', () => {
    const snap = parsePm2Show('garbage output\nno relevant fields\n');
    expect(snap.restarts).toBeNull();
    expect(snap.uptime).toBeNull();
    expect(snap.createdAt).toBeNull();
  });
});
