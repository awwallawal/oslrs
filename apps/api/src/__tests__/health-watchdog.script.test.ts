/**
 * Story 13-78 — the VPS health watchdog (scripts/health-watchdog.sh).
 *
 * The script is bash on purpose (it must not share the fate of the Node/PM2 layer it
 * watches), so this spawns the REAL script with every probe and the Telegram send
 * replaced by stub commands that read/write files in a temp dir, and a fake clock.
 * The root `scripts/` dir has no shell test runner; the API suite runs on CI and pre-push.
 *
 * Windows: the first `bash` on PATH is WSL's, so Git Bash is found next to git.exe.
 * Git Bash has no `flock`, so ONLY the lock case is skipped there (Task 2.4); CI runs it.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const posix = (p: string) => p.replace(/\\/g, '/');
const SCRIPT = posix(resolve(__dirname, '../../../../scripts/health-watchdog.sh'));

function findBash(): string {
  if (process.platform !== 'win32') return 'bash';
  if (process.env.WATCHDOG_TEST_BASH) return process.env.WATCHDOG_TEST_BASH;
  // git.exe lives in <Git>\cmd or <Git>\mingw64\bin depending on the shell; walk up to
  // the install root, the folder that has bin\bash.exe.
  const git = execFileSync('where', ['git'], { encoding: 'utf8' }).split(/\r?\n/)[0].trim();
  for (let dirPath = dirname(git), i = 0; i < 4; dirPath = dirname(dirPath), i++) {
    const bash = join(dirPath, 'bin', 'bash.exe');
    if (existsSync(bash)) return bash;
  }
  throw new Error(`Git Bash not found above ${git}; set WATCHDOG_TEST_BASH. WSL's bash.exe cannot run this test.`);
}
const BASH = findBash();
const HAS_FLOCK = spawnSync(BASH, ['-c', 'command -v flock'], { encoding: 'utf8' }).status === 0;

const TOKEN = 'TEST123:SECRET-TOKEN-do-not-leak';
const T0 = 1_800_000_000; // a fixed fake clock; each run is +60 s
const SEP = '-----8<-----';

const PM2_ONLINE =
  '[{"pid":1260,"name":"pm2-logrotate","pm2_env":{"name":"pm2-logrotate","status":"online"},"pm_id":0},' +
  '{"pid":39932,"name":"oslsr-api","pm2_env":{"name":"oslsr-api","status":"online","env":{"JWT_SECRET":"x"}},"pm_id":1}]';
// The 10-17 shape: PM2 is alive (pm2-logrotate online) but oslsr-api is not.
const PM2_API_STOPPED = PM2_ONLINE.replace('"pid":39932', '"pid":0').replace(
  '"name":"oslsr-api","status":"online"',
  '"name":"oslsr-api","status":"stopped"',
);
const PM2_API_GONE = '[{"pid":1260,"name":"pm2-logrotate","pm2_env":{"name":"pm2-logrotate","status":"online"},"pm_id":0}]';

let dir: string;
let d: string;
let tick: number;

function set(name: string, value: string) {
  writeFileSync(join(dir, name), value);
}
function read(name: string): string {
  const p = join(dir, name);
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
}
function messages(file: 'sent' | 'attempts'): string[] {
  return read(file)
    .split(`${SEP}\n`)
    .filter((m) => m.trim() !== '');
}
const sent = () => messages('sent');
const downs = () => sent().filter((m) => m.includes('OSLRS DOWN'));
const recovereds = () => sent().filter((m) => m.includes('OSLRS RECOVERED'));

function run(extraEnv: Record<string, string> = {}) {
  tick += 1;
  const res = spawnSync(BASH, [SCRIPT], {
    encoding: 'utf8',
    timeout: 60_000,
    env: {
      ...process.env,
      WATCHDOG_STATE_DIR: `${d}/state`,
      WATCHDOG_ENV_FILE: `${d}/env`,
      WATCHDOG_LOG_FILE: `${d}/watchdog.log`,
      WATCHDOG_NOW: String(T0 + 60 * tick),
      WATCHDOG_HEALTH_CMD: `cat "${d}/health"`,
      WATCHDOG_PM2_CMD: `cat "${d}/pm2.json"`,
      WATCHDOG_PG_CMD: `exit "$(cat "${d}/pg")"`,
      WATCHDOG_REDIS_CMD: `printf '%s' "\${REDISCLI_AUTH:-<unset>}" > "${d}/redis-auth"; cat "${d}/redis"`,
      WATCHDOG_SEND_CMD:
        `printf '%s\\n${SEP}\\n' "$WATCHDOG_MESSAGE" >> "${d}/attempts"; rc=$(cat "${d}/sendrc"); ` +
        `if [ "$rc" = 0 ]; then printf '%s\\n${SEP}\\n' "$WATCHDOG_MESSAGE" >> "${d}/sent"; ` +
        `else echo "send failed for token $TELEGRAM_BOT_TOKEN" >&2; fi; exit "$rc"`,
      ...extraEnv,
    },
  });
  expect(res.error, 'the watchdog could not be spawned').toBeUndefined();
  const output = `${res.stdout}${res.stderr}`;
  expect(output, 'the token must never reach stdout/stderr (the cron log)').not.toContain('SECRET-TOKEN');
  return { status: res.status, output };
}

function healthy() {
  set('health', '200');
  set('pm2.json', PM2_ONLINE);
  set('pg', '0');
  set('redis', 'PONG\n');
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'oslsr-watchdog-'));
  d = posix(dir);
  tick = 0;
  set(
    'env',
    [
      'NODE_ENV=production',
      `TELEGRAM_BOT_TOKEN=${TOKEN}`,
      'TELEGRAM_OPERATOR_CHAT_ID=1234567890',
      'REDIS_URL=redis://default:p%40ss%3Aword@localhost:6379',
      '',
    ].join('\n'),
  );
  set('sendrc', '0');
  healthy();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('health-watchdog.sh (Story 13-78)', { timeout: 180_000 }, () => {
  it('a healthy run pages nothing and writes the heartbeat (AC5)', () => {
    const r = run();
    expect(r.status).toBe(0);
    expect(r.output).toMatch(/ ok$/m);
    expect(read('attempts')).toBe('');
    expect(read('state/last-run')).toBe(String(T0 + 60));
    expect(read('state/status')).not.toBe('down'); // absent until the first outage
  });

  it('ONE failing run does not page — a blip is not an outage (AC2; mutation target for CONFIRM_RUNS)', () => {
    set('health', '502');
    const r = run();
    expect(read('attempts')).toBe(''); // first, so a CONFIRM_RUNS=1 mutation fails on the page itself
    expect(r.output).toContain('fail: api (run 1, state up)');
  });

  it('a blip that recovers on the next run never pages at all', () => {
    set('health', '502');
    run();
    healthy();
    run();
    run();
    expect(read('attempts')).toBe('');
  });

  it('TWO failing runs page exactly one DOWN naming the failed checks and the triage commands', () => {
    set('health', '000');
    set('pm2.json', PM2_API_STOPPED);
    run();
    run();
    expect(downs()).toHaveLength(1);
    const m = downs()[0];
    expect(m).toContain('api, pm2');
    expect(m).toContain('/api/v1/health did not answer 200');
    expect(m).toContain('no online oslsr-api');
    expect(m).toContain('pm2 ls');
    expect(m).toContain('docker ps');
  });

  it('a THIRD (and fourth) failing run sends nothing more — no flood while the state is unchanged', () => {
    set('health', '502');
    run();
    run();
    run();
    run();
    expect(messages('attempts')).toHaveLength(1);
    expect(downs()).toHaveLength(1);
  });

  it('recovery sends exactly one RECOVERED with the downtime, then nothing', () => {
    set('health', '502');
    run(); // t+60: first failure
    run(); // t+120: DOWN
    run(); // t+180
    healthy();
    run(); // t+240: first passing run (1 of 2): not yet recovered
    expect(recovereds()).toHaveLength(0);
    run(); // t+300: RECOVERED, down 3m (first failure → first passing run)
    run();
    expect(downs()).toHaveLength(1);
    expect(recovereds()).toHaveLength(1);
    expect(recovereds()[0]).toContain('Down about 3m 0s');
    expect(recovereds()[0]).toContain('(api;');
    expect(read('state/status')).toBe('up');
  });

  it('a failed DOWN send is NOT marked sent: the next run retries it (AC2)', () => {
    set('health', '502');
    set('sendrc', '7');
    run();
    const second = run();
    expect(second.output).toContain('page send failed (exit 7)');
    expect(sent()).toHaveLength(0);
    expect(read('state/down_paged')).toBe('0');
    set('sendrc', '0');
    run();
    expect(downs()).toHaveLength(1);
    run();
    expect(downs()).toHaveLength(1); // once delivered, never again
    expect(messages('attempts')).toHaveLength(2);
  });

  it('a failed RECOVERED send is retried until it is delivered, and says when DOWN never went out', () => {
    set('health', '502');
    set('sendrc', '7');
    run();
    run(); // DOWN attempt fails
    healthy();
    run(); // pass 1 of 2
    run(); // RECOVERED confirmed; its send fails
    expect(messages('attempts').filter((m) => m.includes('OSLRS RECOVERED'))).toHaveLength(1);
    expect(sent()).toHaveLength(0);
    set('sendrc', '0');
    run();
    run();
    expect(recovereds()).toHaveLength(1);
    expect(recovereds()[0]).toContain('The DOWN page for this outage could not be sent.');
    expect(downs()).toHaveLength(0);
  });

  it('the token never appears in any message, and is scrubbed from a failed send’s error text', () => {
    set('health', '502');
    set('sendrc', '3');
    run();
    const r = run(); // the stub echoes the token to stderr on failure
    expect(r.output).toContain('send failed for token ***');
    set('sendrc', '0');
    run();
    healthy();
    run();
    for (const m of messages('attempts')) expect(m).not.toContain('SECRET-TOKEN');
    // The cron log IS the script's stdout+stderr (cron's `>>`; the script never writes
    // WATCHDOG_LOG_FILE itself), and run() asserts the token is absent from both on
    // every run. A check on the log FILE could never fail (code review 13-78 L1).
  });

  it('missing Telegram credentials: no send, logged, and paged once they are back', () => {
    set('env', 'REDIS_URL=redis://default:pw@localhost:6379\n');
    set('health', '502');
    run();
    const r = run();
    expect(r.output).toContain('TELEGRAM_BOT_TOKEN or TELEGRAM_OPERATOR_CHAT_ID is missing');
    expect(read('attempts')).toBe('');
    set('env', `TELEGRAM_BOT_TOKEN=${TOKEN}\nTELEGRAM_OPERATOR_CHAT_ID=1\nREDIS_URL=redis://default:pw@localhost:6379\n`);
    run();
    expect(downs()).toHaveLength(1);
  });

  it('a FLAPPING service pages one DOWN, not a DOWN/RECOVERED pair per flap (review M1; mutation target)', () => {
    // A crash-looping API: fail, fail, pass, repeated. Before the fix: 8 pages in 12 min.
    for (let i = 0; i < 4; i++) {
      set('health', '502');
      run();
      run();
      healthy();
      run();
    }
    expect(recovereds()).toHaveLength(0); // first, so a 1-pass recovery mutation fails here
    expect(downs()).toHaveLength(1);
    expect(read('state/status')).toBe('down');
    run(); // the 2nd passing run in a row confirms recovery
    expect(recovereds()).toHaveLength(1);
    // first failure t+60 → first passing run of the confirming streak t+720
    expect(recovereds()[0]).toContain('Down about 11m 0s');
  });

  describe('an outage that gets WORSE (review M2)', () => {
    function downOnRedis() {
      set('redis', 'ERR');
      run();
      run();
      expect(downs()).toHaveLength(1);
    }
    const worses = () => sent().filter((m) => m.includes('OSLRS WORSE'));

    it('a component that starts failing during an outage pages ONE "WORSE" after 2 runs; RECOVERED names all', () => {
      downOnRedis();
      set('health', '502');
      run(); // api failing, run 1: not yet
      expect(worses()).toHaveLength(0); // first, so a no-confirmation mutation fails here
      run(); // api failing, run 2: WORSE
      run();
      run();
      expect(worses()).toHaveLength(1);
      expect(worses()[0]).toContain('now also failing: api');
      expect(worses()[0]).toContain('Failing now: api, redis');
      expect(worses()[0]).toContain('/api/v1/health did not answer 200');
      healthy();
      run();
      run();
      expect(recovereds()).toHaveLength(1);
      expect(recovereds()[0]).toContain('(redis, api;');
    });

    it('a one-run blip of another component during an outage pages nothing', () => {
      downOnRedis();
      set('health', '502');
      run();
      set('health', '200');
      run();
      run();
      expect(worses()).toHaveLength(0);
      expect(sent()).toHaveLength(1);
    });

    it('a failed WORSE send is retried until delivered, then never repeated', () => {
      downOnRedis();
      set('sendrc', '7');
      set('health', '502');
      run();
      run(); // WORSE attempt fails
      expect(worses()).toHaveLength(0);
      set('sendrc', '0');
      run();
      run();
      expect(worses()).toHaveLength(1);
      expect(messages('attempts').filter((m) => m.includes('OSLRS WORSE'))).toHaveLength(2);
    });
  });

  it('records when page sends started failing, and clears it once one is delivered (review L2)', () => {
    set('health', '502');
    set('sendrc', '7');
    run();
    expect(read('state/page_failing_since')).toBe('');
    run(); // first failed send, t+120
    expect(read('state/page_failing_since')).toBe(String(T0 + 120));
    run(); // still failing: the first time is kept
    expect(read('state/page_failing_since')).toBe(String(T0 + 120));
    set('sendrc', '0');
    run();
    expect(existsSync(join(dir, 'state', 'page_failing_since'))).toBe(false);
  });

  describe('probes (AC1)', () => {
    it('pm2: PM2 alive but oslsr-api stopped (the 10-17 shape) fails, even though another app is online', () => {
      set('pm2.json', PM2_API_STOPPED);
      expect(run().output).toContain('fail: pm2 (');
    });

    it('pm2: oslsr-api missing from jlist fails; empty / broken output fails', () => {
      set('pm2.json', PM2_API_GONE);
      expect(run().output).toContain('fail: pm2 (');
      set('pm2.json', '');
      expect(run().output).toContain('fail: pm2 (');
    });

    it('pm2: the jlist content (the app env, with secrets) is never printed', () => {
      set('pm2.json', PM2_API_STOPPED);
      expect(run().output).not.toContain('JWT_SECRET');
    });

    it('postgres and redis failures are named in the DOWN page', () => {
      set('pg', '2');
      set('redis', 'NOAUTH Authentication required.');
      run();
      run();
      expect(downs()).toHaveLength(1);
      expect(downs()[0]).toContain('postgres, redis');
      expect(downs()[0]).toContain('pg_isready failed');
    });

    it('redis: the password comes from REDIS_URL, URL-decoded, via REDISCLI_AUTH (never argv)', () => {
      run();
      expect(read('redis-auth')).toBe('p@ss:word');
    });

    it('redis: only %XX is decoded; a backslash in the password is kept as is (review L5)', () => {
      set(
        'env',
        `TELEGRAM_BOT_TOKEN=${TOKEN}\nTELEGRAM_OPERATOR_CHAT_ID=1\nREDIS_URL=redis://default:p%40ss%3Aw\\cord%5Cn@localhost:6379\n`,
      );
      run();
      expect(read('redis-auth')).toBe('p@ss:w\\cord\\n');
    });

    it('redis: no REDIS_URL → no REDISCLI_AUTH exported', () => {
      set('env', `TELEGRAM_BOT_TOKEN=${TOKEN}\nTELEGRAM_OPERATOR_CHAT_ID=1\n`);
      run();
      expect(read('redis-auth')).toBe('<unset>');
    });

    it('a hung probe is cut off by the timeout and counts as a failure', () => {
      const r = run({ WATCHDOG_PG_CMD: 'sleep 30', WATCHDOG_PROBE_TIMEOUT: '2' });
      expect(r.output).toContain('fail: postgres (');
    });
  });

  // Review M3: every other test replaces the probes and the send with stub strings, so the
  // REAL commands (curl -K - for the send, docker exec -e REDISCLI_AUTH, pg_isready args,
  // pm2 jlist, the health curl) went untested. Here no override is set; fake curl, docker
  // and pm2 programs are first on PATH and accept ONLY the exact real invocation.
  describe('the real commands, with fake curl/docker/pm2 on PATH (review M3)', () => {
    function fake(name: string, body: string) {
      mkdirSync(join(dir, 'bin'), { recursive: true });
      writeFileSync(join(dir, 'bin', name), `#!/usr/bin/env bash\nd="${d}"\n${body}\n`, { mode: 0o755 });
    }

    beforeEach(() => {
      fake(
        'curl',
        [
          'if [ "$1 $2 $3 $4 $5" = "-fsS --max-time 20 -K -" ]; then',
          '  { printf "ARGV:"; printf " [%s]" "$@"; printf "\\nSTDIN:"; cat; printf "\\n"; } >> "$d/curl-send.log"',
          '  exit "$(cat "$d/sendrc")"',
          'fi',
          `if [ "$*" = "-s -o /dev/null -w %{http_code} --max-time 5 http://127.0.0.1:3000/api/v1/health" ]; then cat "$d/health"; exit 0; fi`,
          'echo "unexpected curl args: $*" >&2; exit 99',
        ].join('\n'),
      );
      fake(
        'docker',
        [
          'case "$*" in',
          '  "exec oslsr-postgres pg_isready -U oslsr_user -d oslsr_db") exit "$(cat "$d/pg")" ;;',
          '  "exec -e REDISCLI_AUTH oslsr-redis redis-cli ping") printf "%s" "${REDISCLI_AUTH:-<unset>}" > "$d/redis-auth"; cat "$d/redis" ;;',
          '  *) echo "unexpected docker args: $*" >&2; exit 99 ;;',
          'esac',
        ].join('\n'),
      );
      fake('pm2', '[ "$*" = jlist ] && cat "$d/pm2.json" || { echo "unexpected pm2 args: $*" >&2; exit 99; }');
    });

    function runReal() {
      tick += 1;
      const env: NodeJS.ProcessEnv = { ...process.env };
      for (const k of Object.keys(env)) if (k.startsWith('WATCHDOG_')) delete env[k];
      Object.assign(env, {
        WATCHDOG_STATE_DIR: `${d}/state`,
        WATCHDOG_ENV_FILE: `${d}/env`,
        WATCHDOG_LOG_FILE: `${d}/watchdog.log`,
        WATCHDOG_NOW: String(T0 + 60 * tick),
        FAKE_BIN: `${d}/bin`,
        WATCHDOG_SCRIPT: SCRIPT,
      });
      // PATH is set INSIDE bash: Git for Windows' bash.exe launcher puts its own /usr/bin
      // ahead of the PATH it is given, so the real curl would win over the fake. And
      // `C:/…` would split at its colon, so it goes through cygpath where that exists.
      const cmd = 'b=$(cygpath -u "$FAKE_BIN" 2>/dev/null || printf %s "$FAKE_BIN"); PATH="$b:$PATH" exec bash "$WATCHDOG_SCRIPT"';
      const res = spawnSync(BASH, ['-c', cmd], {
        encoding: 'utf8',
        timeout: 60_000,
        env,
      });
      expect(res.error, 'the watchdog could not be spawned').toBeUndefined();
      const output = `${res.stdout}${res.stderr}`;
      expect(output).not.toContain('SECRET-TOKEN');
      // The script discards probe stderr, so a wrong invocation shows up as the fake's
      // exit 99, i.e. a failing check — which is what the assertions below catch.
      return output;
    }

    it('all four real probes pass on a healthy box; the redis password reaches docker via the environment', () => {
      const out = runReal();
      expect(out).toMatch(/ ok$/m);
      expect(read('redis-auth')).toBe('p@ss:word');
    });

    it('the real send: token only on stdin (curl -K -), chat id and text as form fields', () => {
      set('health', '502');
      runReal();
      runReal();
      const log = read('curl-send.log');
      expect(log.match(/^ARGV:/gm)).toHaveLength(1);
      const argv = log.slice(0, log.indexOf('\nSTDIN:'));
      expect(argv).not.toContain('SECRET-TOKEN');
      expect(argv).toContain('[--data-urlencode] [chat_id=1234567890]');
      expect(argv).toContain('[--data-urlencode] [text=🚨 OSLRS DOWN');
      expect(log).toContain(`STDIN:url = "https://api.telegram.org/bot${TOKEN}/sendMessage"`);
      expect(read('state/down_paged')).toBe('1');
    });

    it('a real curl failure is not marked sent', () => {
      set('health', '502');
      set('sendrc', '22');
      runReal();
      const out = runReal();
      expect(out).toContain('page send failed (exit 22)');
      expect(read('state/down_paged')).toBe('0');
    });
  });

  it('caps its own log: over 1 MiB it is cut to the newest 512 KiB, in place (AC4)', () => {
    set('watchdog.log', `OLDEST-LINE\n${'x'.repeat(1_200_000)}\nNEWEST-LINE\n`);
    run();
    const size = statSync(join(dir, 'watchdog.log')).size;
    expect(size).toBeLessThanOrEqual(524_288);
    expect(read('watchdog.log')).toContain('NEWEST-LINE');
    expect(read('watchdog.log')).not.toContain('OLDEST-LINE');
  });

  describe('install and deploy wiring (static, AC4/AC5 + Task 4.1)', () => {
    const repo = resolve(__dirname, '../../../..');
    const text = (p: string) => readFileSync(join(repo, p), 'utf8');

    it('the cron.d file runs the repo script every minute as root, appending to the log', () => {
      const cron = text('infra/cron/oslsr-health-watchdog');
      // cron.d ignores file names with a dot, and a last line without a newline.
      const target = /install .* (\/etc\/cron\.d\/\S+)/.exec(cron)?.[1] ?? '';
      expect(target).toBe('/etc/cron.d/oslsr-health-watchdog');
      expect(target.split('/').pop()).not.toContain('.');
      expect(cron.endsWith('\n')).toBe(true);
      expect(cron).not.toContain('\r');
      const job = cron.split('\n').filter((l) => l.trim() && !l.startsWith('#') && !l.includes('='));
      expect(job).toEqual([
        '* * * * * root /bin/bash /root/oslrs/scripts/health-watchdog.sh >> /var/log/oslsr-health-watchdog.log 2>&1',
      ]);
    });

    it('the deploy WARNS (never fails) on a missing or stale watchdog heartbeat', () => {
      const ci = text('.github/workflows/ci-cd.yml');
      const start = ci.indexOf('WD_AT=$(cat /var/lib/oslsr-watchdog/last-run');
      expect(start, 'heartbeat check missing from the deploy script').toBeGreaterThan(-1);
      const block = ci.slice(start, ci.indexOf('esac', start));
      expect(block).toContain('::warning::VPS health watchdog has NO heartbeat');
      expect(block).toContain('-gt 600');
      expect(block).not.toMatch(/exit\s+1|::error::/);
      // ...and it sits after the 13-77 runtime check, before anything installs.
      expect(start).toBeGreaterThan(ci.indexOf('VPS runtime drift'));
      expect(start).toBeLessThan(ci.indexOf('pnpm install --frozen-lockfile', ci.indexOf('VPS runtime drift')));
    });

    it('review L3: the cron redirect and the script cap the SAME log file', () => {
      const cronPath = />> (\S+) 2>&1/.exec(text('infra/cron/oslsr-health-watchdog'))?.[1];
      const scriptPath = /WATCHDOG_LOG_FILE:-([^}]+)\}/.exec(text('scripts/health-watchdog.sh'))?.[1];
      expect(cronPath).toBe('/var/log/oslsr-health-watchdog.log');
      expect(scriptPath).toBe(cronPath);
    });

    it('review L2: the deploy WARNS (never fails) when the watchdog has been unable to page for >10 min', () => {
      const ci = text('.github/workflows/ci-cd.yml');
      const start = ci.indexOf('WD_PF=$(cat /var/lib/oslsr-watchdog/page_failing_since');
      expect(start, 'page-failure check missing from the deploy script').toBeGreaterThan(-1);
      const block = ci.slice(start, ci.indexOf('esac', start));
      expect(block).toContain('::warning::VPS health watchdog cannot deliver pages');
      expect(block).toContain('-gt 600');
      expect(block).not.toMatch(/exit\s+1|::error::/);
      expect(start).toBeLessThan(ci.indexOf('pnpm install --frozen-lockfile', ci.indexOf('VPS runtime drift')));
      // ...and the script writes the file the deploy reads.
      expect(text('scripts/health-watchdog.sh')).toContain('put page_failing_since');
    });

    it('review L4: the 4.1(b) gate warns and pages when no job named deploy is found', () => {
      const ci = text('.github/workflows/ci-cd.yml');
      const gate = ci.slice(ci.indexOf('name: Did the cancelled deploy reach the VPS?'));
      expect(gate).toMatch(/""\)\s+echo "::warning::No job named 'deploy'[^\n]*\n\s+echo "page=true"/);
    });

    it('4.1(a): every runtime read falls back instead of exiting before the PREV_HEAD reset', () => {
      const ci = text('.github/workflows/ci-cd.yml');
      for (const v of ['WANT_NODE', 'HAVE_NODE', 'WANT_PNPM', 'HAVE_PNPM']) {
        const line = ci.split('\n').find((l) => l.trim().startsWith(`${v}=$(`));
        expect(line, v).toMatch(new RegExp(`\\|\\| ${v}=\\w+$`));
      }
    });

    it('4.1(b): the cancelled-deploy gate names a step the deploy job really has', () => {
      const ci = text('.github/workflows/ci-cd.yml');
      const gate = ci.slice(ci.indexOf('name: Did the cancelled deploy reach the VPS?'));
      const stepName = /select\(\.name == "(Deploy[^"]+)"\)/.exec(gate)?.[1];
      expect(stepName).toBe('Deploy to DigitalOcean VPS');
      expect(ci).toContain(`      - name: ${stepName}\n`);
      expect(gate).toContain("if: steps.gate.outputs.page == 'true'");
    });

    it('4.1(c): a scheduled edge check that ends cancelled (timed out) pages', () => {
      const pv = text('.github/workflows/prod-verify.yml');
      const page = pv.slice(pv.indexOf('\n  page:'));
      expect(page).toContain("needs.edge-freshness.result == 'cancelled'");
    });
  });

  it.skipIf(!HAS_FLOCK)('a run that finds the lock held is skipped, not stacked (AC3; needs flock — CI/VPS)', () => {
    set('health', '502');
    run(); // creates state/ and the lock file; failure 1
    const held = spawnSync(BASH, ['-c', `flock "${d}/state/lock" "${BASH}" "${SCRIPT}"`], {
      encoding: 'utf8',
      timeout: 60_000,
      env: {
        ...process.env,
        WATCHDOG_STATE_DIR: `${d}/state`,
        WATCHDOG_ENV_FILE: `${d}/env`,
        WATCHDOG_LOG_FILE: `${d}/watchdog.log`,
        WATCHDOG_HEALTH_CMD: 'echo 502',
        WATCHDOG_SEND_CMD: 'exit 0',
      },
    });
    expect(`${held.stdout}${held.stderr}`).toContain('skip: the previous run still holds the lock');
    expect(read('state/fails')).toBe('1'); // the skipped run counted nothing
  });
});
