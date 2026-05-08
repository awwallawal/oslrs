#!/usr/bin/env tsx
/**
 * Story 9-10 — PM2 ↺ trajectory capture.
 *
 * Run on the VPS (or via Tailscale SSH) to snapshot PM2 restart events, cross-
 * reference with deploy commits from git log, and emit a markdown chunk for
 * 9-10-pm2-restart-investigation.md.
 *
 * Usage on VPS:
 *   tsx /root/oslrs/apps/api/src/scripts/capture-pm2-restart-trajectory.ts \
 *     --since 2026-04-27T07:30:00Z >> /tmp/9-10-trajectory.md
 *
 * Usage from operator laptop (via Tailscale):
 *   ssh root@oslsr-home-app "tsx /root/oslrs/apps/api/src/scripts/capture-pm2-restart-trajectory.ts --since 2026-04-27T07:30:00Z"
 *
 * Read-only — no DB access, no service writes. Reads /root/.pm2/pm2.log +
 * shells `pm2 show` and `git log`.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

interface RestartEvent {
  iso: string;
  signal: string;
  pid: string;
}

interface DeployCommit {
  iso: string;
  hash: string;
  subject: string;
}

interface CliOptions {
  since: string;
  pm2Log: string;
  repoDir: string;
  branch: string;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    since: '',
    pm2Log: '/root/.pm2/pm2.log',
    repoDir: '/root/oslrs',
    branch: 'main',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--since') opts.since = argv[++i] ?? '';
    else if (a === '--pm2-log') opts.pm2Log = argv[++i] ?? opts.pm2Log;
    else if (a === '--repo') opts.repoDir = argv[++i] ?? opts.repoDir;
    else if (a === '--branch') opts.branch = argv[++i] ?? opts.branch;
  }
  if (!opts.since) {
    console.error('Missing --since <ISO timestamp>');
    process.exit(2);
  }
  return opts;
}

function readRestartEvents(pm2LogPath: string, sinceIso: string): RestartEvent[] {
  const content = readFileSync(pm2LogPath, 'utf8');
  const re = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}): PM2 log: App \[oslsr-api:0\] exited with code \[\d+\] via signal \[([A-Z]+)\]/gm;
  const pidRe = /pid=(\d+) msg=process killed/;
  const lines = content.split('\n');
  const events: RestartEvent[] = [];
  // Story 9-10 review L1: parse `sinceIso` once via Date.parse so non-canonical
  // ISO forms (e.g. `+00:00` instead of `Z`) compare correctly. Lex comparison
  // would silently mis-filter when offsets differ between caller and log.
  const sinceMs = Date.parse(sinceIso);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    re.lastIndex = 0;
    const m = re.exec(line);
    if (!m) continue;
    const [, ts, signal] = m;
    if (!ts || !signal) continue;
    const iso = `${ts}Z`;
    if (Date.parse(iso) < sinceMs) continue;
    const next = lines[i + 1] ?? '';
    const pidMatch = pidRe.exec(next);
    events.push({ iso, signal, pid: pidMatch?.[1] ?? '?' });
  }
  return events;
}

function readDeployCommits(repoDir: string, sinceIso: string, branch = 'main'): DeployCommit[] {
  // Story 9-10 review L2: branch parameterised so renaming `main` (or moving to
  // a release-branch deploy model) doesn't silently drop deploy correlations.
  const out = execFileSync('git', ['-C', repoDir, 'log', `--since=${sinceIso}`, '--pretty=format:%H|%aI|%s', branch], {
    encoding: 'utf8',
  });
  const commits: DeployCommit[] = [];
  for (const line of out.split('\n')) {
    if (!line) continue;
    const [hash, iso, ...subjectParts] = line.split('|');
    if (!hash || !iso) continue;
    commits.push({ hash: hash.slice(0, 7), iso, subject: subjectParts.join('|') });
  }
  return commits;
}

interface Pm2Snapshot {
  restarts: number | null;
  uptime: string | null;
  createdAt: string | null;
}

/**
 * Parse `pm2 show <name>` text output. Exported for unit testability.
 * Story 9-10 review M2: regex relaxed from `│` (Unicode box-drawing) to
 * `[^\d\n]+` so PM2 versions that drop ANSI/box-drawing still parse cleanly.
 */
export function parsePm2Show(out: string): Pm2Snapshot {
  const restarts = /restarts[^\d\n]*(\d+)/.exec(out)?.[1];
  const uptime = /uptime[^A-Za-z\d\n]*([^\n│|]+)/.exec(out)?.[1]?.trim();
  const createdAt = /created at[^A-Za-z\d\n]*([^\n│|]+)/.exec(out)?.[1]?.trim();
  return {
    restarts: restarts ? Number.parseInt(restarts, 10) : null,
    uptime: uptime ?? null,
    createdAt: createdAt ?? null,
  };
}

function readPm2Snapshot(): Pm2Snapshot {
  try {
    const out = execFileSync('pm2', ['show', 'oslsr-api'], { encoding: 'utf8' });
    return parsePm2Show(out);
  } catch {
    return { restarts: null, uptime: null, createdAt: null };
  }
}

function correlateDeploys(events: RestartEvent[], commits: DeployCommit[]): Array<{ event: RestartEvent; deploy: DeployCommit | null }> {
  const result: Array<{ event: RestartEvent; deploy: DeployCommit | null }> = [];
  for (const ev of events) {
    const eventMs = Date.parse(ev.iso);
    let best: { commit: DeployCommit; gapSec: number } | null = null;
    for (const c of commits) {
      const gapSec = (eventMs - Date.parse(c.iso)) / 1000;
      // CI deploy completes ~5-10 minutes after push. Window: commit must be
      // 60-900s before the restart event.
      if (gapSec >= 60 && gapSec <= 900) {
        if (!best || gapSec < best.gapSec) best = { commit: c, gapSec };
      }
    }
    result.push({ event: ev, deploy: best?.commit ?? null });
  }
  return result;
}

function emitMarkdown(opts: CliOptions, snapshot: ReturnType<typeof readPm2Snapshot>, correlated: ReturnType<typeof correlateDeploys>): string {
  const out: string[] = [];
  const now = new Date().toISOString();
  out.push(`### Capture ${now}`);
  out.push('');
  out.push(`- **Window start:** ${opts.since}`);
  out.push(`- **PM2 process restarts (current daemon entry):** ${snapshot.restarts ?? 'n/a'}`);
  out.push(`- **PM2 process uptime:** ${snapshot.uptime ?? 'n/a'}`);
  out.push(`- **PM2 process created at:** ${snapshot.createdAt ?? 'n/a'}`);
  out.push('');
  const total = correlated.length;
  const matched = correlated.filter((c) => c.deploy !== null).length;
  const spontaneous = total - matched;
  out.push(`**Restart events in window:** ${total} total — ${matched} deploy-correlated · ${spontaneous} spontaneous`);
  out.push('');
  out.push('| ISO | Signal | PID | Deploy hash | Deploy subject |');
  out.push('|---|---|---|---|---|');
  for (const { event, deploy } of correlated) {
    const subject = deploy?.subject ?? '';
    const safeSubject = subject.replace(/\|/g, '\\|');
    out.push(`| ${event.iso} | ${event.signal} | ${event.pid} | ${deploy?.hash ?? '_spontaneous_'} | ${safeSubject} |`);
  }
  out.push('');
  return out.join('\n');
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2));
  const events = readRestartEvents(opts.pm2Log, opts.since);
  const commits = readDeployCommits(opts.repoDir, opts.since, opts.branch);
  const snapshot = readPm2Snapshot();
  const correlated = correlateDeploys(events, commits);
  process.stdout.write(emitMarkdown(opts, snapshot, correlated));
}

const isCli = process.argv[1]?.endsWith('capture-pm2-restart-trajectory.ts')
  || process.argv[1]?.endsWith('capture-pm2-restart-trajectory.js');
if (isCli) {
  try {
    main();
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

export { readRestartEvents, readDeployCommits, correlateDeploys };
