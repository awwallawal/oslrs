#!/usr/bin/env tsx
/**
 * UAT Smoke Test: Refresh-token rotation / reuse-detection / logout-invalidation.
 *
 * Black-box HTTP runner — exercises the DEPLOYED auth surface over the network
 * (not in-process), so it verifies the real prod artifact + prod Redis + the
 * nginx/cookie chain that unit + E2E suites never touch.
 *
 * Covers (Story 9-42, re-verified by every future change to the same flow):
 *   - F-022 rotation:        /refresh issues a NEW refresh cookie each call
 *   - 9-48 M1 grace window:  replay of a just-consumed token WITHIN ~10s (multi-tab) → 200 re-issue (NOT revoked)
 *   - F-022 reuse detection: replay of a consumed token AFTER the grace window → 401 + family revoke
 *   - F-012 logout:          after logout, the session's refresh token is rejected
 * Reuse it as the regression gate for Story 9-48 (rotation grace window / OPS-3
 * hash-at-rest — the cookie contract is unchanged, so these assertions still hold)
 * and Story 9-49 (boot silent-refresh).
 *
 * --------------------------------------------------------------------------
 * USAGE
 *
 *   LOCAL (full coverage — CAPTCHA auto-skips when the API runs NODE_ENV=development;
 *   in NODE_ENV=test pass --captcha-token=test-captcha-bypass):
 *     tsx scripts/uat-refresh-rotation-smoke.ts \
 *       --base-url=http://localhost:3000 --login \
 *       --email=clerk@example.com --password='...' --login-path=/auth/staff/login
 *
 *   PROD (CAPTCHA + MFA block scripted login → paste browser-captured cookies).
 *   Log in twice in the browser (or one private window each), copy the `refreshToken`
 *   cookie value from DevTools → Application → Cookies after EACH login:
 *     tsx scripts/uat-refresh-rotation-smoke.ts \
 *       --base-url=https://oyotradeministry.com.ng \
 *       --refresh-cookie=<value-from-session-1> \
 *       --refresh-cookie=<value-from-session-2>
 *
 *   One cookie runs TEST 1 only (rotation + reuse). A second cookie unlocks TEST 2
 *   (logout invalidation), which needs an independent session because TEST 1
 *   revokes the whole family.
 *
 * ⚠️  Use a THROWAWAY/test account. TEST 1 deliberately trips reuse detection,
 *     which revokes that account's entire token family (logs out its sessions).
 *     Never smoke with a live operator/super_admin account.
 *
 * Exit codes: 0 = all run assertions passed · 1 = a failure or a fatal setup error.
 * --------------------------------------------------------------------------
 * Authored 2026-06-08 as the close-out UAT for Story 9-42 (auth/token/session
 * hardening). Permanent runner — keep for refresh-flow regression checks,
 * deploy smokes, and Stories 9-48 / 9-49.
 */

const args = process.argv.slice(2);
const has = (name: string) => args.includes(`--${name}`);
const val = (name: string): string | undefined =>
  args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const all = (name: string): string[] =>
  args.filter((a) => a.startsWith(`--${name}=`)).map((a) => a.split('=').slice(1).join('='));

if (has('help')) {
  console.log(readUsageFromHeader());
  process.exit(0);
}

const BASE_URL = (val('base-url') ?? 'http://localhost:3000').replace(/\/$/, '');
const API = `${BASE_URL}/api/v1`;
const LOGIN_MODE = has('login');
const LOGIN_PATH = val('login-path') ?? '/auth/staff/login';
const EMAIL = val('email');
const PASSWORD = val('password');
const CAPTCHA_TOKEN = val('captcha-token') ?? 'test-captcha-bypass';
const REMEMBER_ME = has('remember-me');
const PROVIDED_COOKIES = all('refresh-cookie');

let pass = 0;
let fail = 0;
let skip = 0;
const log = (s = '') => console.log(s);
const ok = (msg: string) => { pass++; log(`  \x1b[32m[PASS]\x1b[0m ${msg}`); };
const bad = (msg: string) => { fail++; log(`  \x1b[31m[FAIL]\x1b[0m ${msg}`); };
const note = (msg: string) => log(`  \x1b[2m• ${msg}\x1b[0m`);
const skipped = (msg: string) => { skip++; log(`  \x1b[33m[SKIP]\x1b[0m ${msg}`); };

interface ApiResult { status: number; json: any; refreshCookie?: string }

/** POST {API}{path}; optionally send a refresh cookie + bearer; capture the rotated refresh cookie. */
async function post(path: string, opts: { body?: unknown; cookie?: string; bearer?: string } = {}): Promise<ApiResult> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.cookie) headers['cookie'] = `refreshToken=${opts.cookie}`;
  if (opts.bearer) headers['authorization'] = `Bearer ${opts.bearer}`;
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let json: any = null;
  try { json = await res.json(); } catch { /* empty body */ }
  return { status: res.status, json, refreshCookie: extractRefreshCookie(res) };
}

function extractRefreshCookie(res: Response): string | undefined {
  // Node 19.7+/undici exposes getSetCookie(); fall back to the combined header.
  const raw: string[] =
    typeof (res.headers as any).getSetCookie === 'function'
      ? (res.headers as any).getSetCookie()
      : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie') as string] : []);
  for (const c of raw) {
    const m = c.match(/(?:^|,\s*)refreshToken=([^;]+)/);
    if (m && m[1] && m[1] !== '') return m[1];
  }
  return undefined;
}

/** Acquire a fresh session via password login (local/dev only — CAPTCHA blocks prod). */
async function loginFresh(): Promise<{ accessToken: string; cookie: string }> {
  if (!EMAIL || !PASSWORD) throw new Error('--login requires --email and --password');
  const r = await post(LOGIN_PATH, { body: { email: EMAIL, password: PASSWORD, rememberMe: REMEMBER_ME, captchaToken: CAPTCHA_TOKEN } });
  if (r.json?.data?.requiresMfa) {
    throw new Error('login returned an MFA challenge — scripted login cannot complete MFA. Use a non-MFA account or --refresh-cookie (prod).');
  }
  if (r.status !== 200 || !r.json?.data?.accessToken || !r.refreshCookie) {
    throw new Error(`login failed (status ${r.status}): ${JSON.stringify(r.json)} — on prod, CAPTCHA blocks scripted login; use --refresh-cookie.`);
  }
  return { accessToken: r.json.data.accessToken, cookie: r.refreshCookie };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
// Must exceed the server's REFRESH_ROTATION_GRACE_SECONDS (10s, Story 9-48 M1). Tunable.
const GRACE_WAIT_MS = Number(val('grace-wait-ms') ?? 11000);

// TEST 1 — rotation chain + 9-48 multi-tab grace window. Fast; consumes this session.
async function test1RotationAndGrace(cookie0: string): Promise<void> {
  log('\nTEST 1 — F-022 rotation + 9-48 multi-tab grace window:');
  const r1 = await post('/auth/refresh', { cookie: cookie0 });
  if (r1.status === 200 && r1.refreshCookie && r1.refreshCookie !== cookie0) ok('refresh rotated the cookie (new value issued)');
  else { bad(`expected 200 + a NEW refresh cookie; got status ${r1.status}, rotated=${!!r1.refreshCookie}`); return; }

  const r2 = await post('/auth/refresh', { cookie: r1.refreshCookie });
  if (r2.status === 200 && r2.refreshCookie && r2.refreshCookie !== r1.refreshCookie) ok('rotation chains (2nd refresh issues another new cookie)');
  else bad(`expected chained rotation; got status ${r2.status}`);

  // 9-48 M1: a just-consumed token replayed WITHIN the grace window (10s) is benign
  // multi-tab concurrency → RE-ISSUED (200), NOT a family-revoking 401. cookie0 was
  // consumed by r1 a fraction of a second ago, so this replay is inside the window.
  const r3 = await post('/auth/refresh', { cookie: cookie0 });
  if (r3.status === 200 && r3.refreshCookie) ok('within-grace replay of a consumed token → 200 re-issued (multi-tab benign; family NOT revoked)');
  else bad(`expected 200 (9-48 grace re-issue) on within-grace consumed-token replay; got ${r3.status}`);
}

// TEST 1b — post-grace reuse → 401 + family revoke (F-022, preserved OUTSIDE the 9-48
// grace window). Needs a fresh session + a wait past the grace window.
async function test1bPostGraceReuse(source: { cookie: string }): Promise<void> {
  log(`\nTEST 1b — post-grace reuse detection (waits ~${Math.round(GRACE_WAIT_MS / 1000)}s past the grace window):`);
  const rA = await post('/auth/refresh', { cookie: source.cookie });
  if (rA.status !== 200 || !rA.refreshCookie) { bad(`setup: first refresh should rotate (200); got ${rA.status}`); return; }
  const activeCookie = rA.refreshCookie; // current valid token; source.cookie is now consumed

  await sleep(GRACE_WAIT_MS); // outlive REFRESH_ROTATION_GRACE_SECONDS so the replay is a genuine reuse

  const replay = await post('/auth/refresh', { cookie: source.cookie });
  if (replay.status === 401) ok('post-grace replay of the consumed token → 401 (reuse detected)');
  else bad(`expected 401 on post-grace consumed-token replay; got ${replay.status}`);

  const family = await post('/auth/refresh', { cookie: activeCookie });
  if (family.status === 401) ok('the still-current token is now rejected too → family revoked');
  else bad(`expected 401 (family revoke) after reuse; got ${family.status}`);
}

async function test2LogoutInvalidation(source: { accessToken: string; cookie: string }): Promise<void> {
  log('\nTEST 2 — F-012 logout positively invalidates the refresh token:');
  const out = await post('/auth/logout', { bearer: source.accessToken, cookie: source.cookie });
  if (out.status === 200) ok('logout returned 200');
  else { bad(`logout failed: status ${out.status} ${JSON.stringify(out.json)}`); return; }

  const after = await post('/auth/refresh', { cookie: source.cookie });
  if (after.status === 401) ok('post-logout refresh is rejected → refresh token invalidated (F-012)');
  else bad(`expected 401 after logout; got ${after.status}`);
}

/** In cookie-mode, derive an access token + active cookie from a raw refresh cookie (one rotation). */
async function deriveSession(rawCookie: string): Promise<{ accessToken: string; cookie: string }> {
  const r = await post('/auth/refresh', { cookie: rawCookie });
  if (r.status !== 200 || !r.json?.data?.accessToken || !r.refreshCookie) {
    throw new Error(`could not derive a session from the provided cookie (status ${r.status}) — is it current/unconsumed?`);
  }
  return { accessToken: r.json.data.accessToken, cookie: r.refreshCookie };
}

async function main(): Promise<void> {
  log(`Refresh-token rotation smoke → ${API}`);
  log(`Mode: ${LOGIN_MODE ? `login (${LOGIN_PATH}, ${EMAIL})` : `cookie (${PROVIDED_COOKIES.length} provided)`}`);

  // Liveness first — fail fast on a wrong base-url.
  const health = await fetch(`${API}/health`).then((r) => r.ok).catch(() => false);
  if (!health) { console.error(`FATAL: ${API}/health not reachable. Check --base-url.`); process.exit(1); }
  note('health ok');

  if (LOGIN_MODE) {
    await test1RotationAndGrace((await loginFresh()).cookie);
    await test1bPostGraceReuse(await loginFresh()); // fresh session (TEST 1 consumed its own)
    await test2LogoutInvalidation(await loginFresh());
  } else {
    if (PROVIDED_COOKIES.length === 0) { console.error('FATAL: provide --login OR at least one --refresh-cookie=<value>.'); process.exit(1); }
    await test1RotationAndGrace(PROVIDED_COOKIES[0]);
    if (PROVIDED_COOKIES.length >= 2) await test1bPostGraceReuse({ cookie: PROVIDED_COOKIES[1] });
    else { log('\nTEST 1b — post-grace reuse:'); skipped('needs a 2nd --refresh-cookie=<value>.'); }
    if (PROVIDED_COOKIES.length >= 3) await test2LogoutInvalidation(await deriveSession(PROVIDED_COOKIES[2]));
    else { log('\nTEST 2 — logout invalidation:'); skipped('needs a 3rd --refresh-cookie=<value>.'); }
  }

  log(`\n${'─'.repeat(60)}`);
  log(`Result: \x1b[32m${pass} passed\x1b[0m, \x1b[31m${fail} failed\x1b[0m, \x1b[33m${skip} skipped\x1b[0m`);
  process.exit(fail > 0 ? 1 : 0);
}

function readUsageFromHeader(): string {
  return 'See the docblock at the top of scripts/uat-refresh-rotation-smoke.ts for full usage.';
}

main().catch((err) => {
  console.error(`\nFATAL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
