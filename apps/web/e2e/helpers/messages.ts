import { expect, type Page } from '@playwright/test';

/**
 * Messaging E2E helpers — deterministic data-ready waits (Story 13-36).
 *
 * WHY THIS EXISTS
 * ---------------
 * `SupervisorMessagesPage` returns a full-page loading skeleton while its
 * `useInbox()` query is in flight (SupervisorMessagesPage.tsx:90-115). Nothing
 * inside `MessageInbox` — including the "Broadcast to Team" and
 * "New Conversation" header buttons — is mounted until that query resolves.
 *
 * The pre-13-36 tests navigated to /messages and immediately clicked those
 * buttons, so the ONLY thing standing between the suite and a red run was
 * Playwright's 15s `actionTimeout` (playwright.config.ts:18). Under CI load the
 * inbox fetch occasionally lagged past it →
 *   `TimeoutError: locator.click … getByRole('button', { name: /send broadcast/i })`
 * i.e. a missing deterministic wait, NOT a product bug. (Story 13-36 AC2 →
 * test-side fix; see the story's Dev Agent Record for the AC2 rationale.)
 *
 * HOW WE WAIT — and why NOT `waitForResponse`
 * -------------------------------------------
 * The first cut of these helpers gated on `page.waitForResponse('**\/messages/inbox')`.
 * The AC4 burn-in then failed ~1-in-30 with
 *   `TimeoutError: page.waitForResponse: Timeout 20000ms exceeded while waiting for event "response"`
 * — a NEW flake introduced by the fix itself. Waiting on a network event is a hard
 * dependency on OBSERVING that exact event: an aborted, retried, service-worker-served
 * or otherwise-invisible request means the event never arrives and the test dies,
 * even though the page rendered perfectly.
 *
 * So these helpers gate on the RENDERED ANCHOR instead — an element the page mounts
 * only on its data-loaded branch — via an auto-retrying `expect`, with an explicit
 * generous budget. That is strictly more robust: it cannot miss an event, it tolerates
 * however the data arrived, and it still fails fast and legibly when data never lands.
 * (AC1 explicitly allows either form; the anchor form is the one that survives.)
 *
 * Rule of thumb this leaves behind:
 *   - gating a RENDER  → assert the loaded-branch anchor (here);
 *   - asserting a WRITE actually reached the server → `waitForResponse` is right,
 *     because no DOM state can prove it (see wizard-registration.spec.ts:227).
 *
 * SECOND RULE, added by the 2026-07-27 review (AI-1/AI-3)
 * ------------------------------------------------------
 * An anchor wait must cover EVERY settled branch the component can render —
 * loaded, empty AND error. An anchor set that omits the error branch degrades to
 * a bare 20s timeout precisely when something is actually broken, which is the
 * anonymous-timeout failure this story exists to remove. And a diagnostic must
 * never state as observed fact something it did not observe: a helper with no
 * traffic listener attached says so, rather than reporting "no request was seen"
 * and implying the browser was offline.
 */

/** `GET /api/v1/messages/inbox` — the query that gates the whole Messages page. */
const INBOX_ENDPOINT = '/messages/inbox';

/**
 * Budget for "the data landed and React committed it". Deliberately larger than the
 * 10s default `expect` timeout (playwright.config.ts:15) because this is the one
 * wait that absorbs CI-load latency — the whole point of the story.
 */
const DATA_READY_TIMEOUT = 20_000;

/**
 * `POST /auth/refresh` — the boot/silent re-mint of the in-memory access token.
 * Tracked because `apiClient` does `await awaitAccessToken()` BEFORE it calls
 * `fetch` (api-client.ts:52): while a boot refresh is in flight, EVERY authed
 * request is queued and NO network request is issued. A refresh that never
 * settles therefore looks exactly like "the query never fired".
 */
const REFRESH_ENDPOINT = '/auth/refresh';

/** A live record of the network activity that can explain a stuck Messages page. */
interface InboxTraffic {
  readonly lines: string[];
  readonly auth: string[];
  /** Requests started but never finished, by URL — a hung fetch blocks the queue. */
  pending(): string[];
  stop(): void;
}

/**
 * Observe the traffic that gates the Messages page, purely for DIAGNOSTICS —
 * never as a gate (see the header note). If the page ends up on its error branch,
 * these lines turn an anonymous 20s timeout into "the API returned 503".
 *
 * Tracks THREE things, because "the page is stuck" has three very different causes
 * that are indistinguishable from the DOM alone:
 *   1. inbox responses/failures — did the query itself fail?
 *   2. auth-refresh traffic     — did the SESSION die (401 → redirect), or is a
 *      boot refresh still in flight and holding every authed request behind it?
 *   3. still-pending requests   — a fetch that never settles never retries and
 *      never errors; the query simply stays `pending` forever.
 *
 * Must be attached BEFORE the action that triggers the fetch, or the events fire
 * before anyone is listening and the record is silently empty.
 */
function observeInboxTraffic(page: Page): InboxTraffic {
  const lines: string[] = [];
  const auth: string[] = [];
  const inFlight = new Map<string, string>();

  const relevant = (url: string) => url.includes(INBOX_ENDPOINT) || url.includes(REFRESH_ENDPOINT);
  const label = (url: string) => (url.includes(REFRESH_ENDPOINT) ? 'auth/refresh' : 'messages/inbox');

  const onRequest = (request: { url(): string }) => {
    if (relevant(request.url())) inFlight.set(request.url(), label(request.url()));
  };
  const onResponse = (response: { url(): string; status(): number }) => {
    const url = response.url();
    if (!relevant(url)) return;
    inFlight.delete(url);
    (url.includes(REFRESH_ENDPOINT) ? auth : lines).push(`HTTP ${response.status()}`);
  };
  const onRequestFailed = (request: { url(): string; failure(): { errorText: string } | null }) => {
    const url = request.url();
    if (!relevant(url)) return;
    inFlight.delete(url);
    const text = `request failed: ${request.failure()?.errorText ?? 'unknown'}`;
    (url.includes(REFRESH_ENDPOINT) ? auth : lines).push(text);
  };

  page.on('request', onRequest);
  page.on('response', onResponse);
  page.on('requestfailed', onRequestFailed);

  return {
    lines,
    auth,
    pending: () => [...inFlight.values()],
    stop() {
      page.off('request', onRequest);
      page.off('response', onResponse);
      page.off('requestfailed', onRequestFailed);
    },
  };
}

/**
 * Navigate to the Messages page and wait until the inbox data has actually
 * rendered — i.e. until the header actions are mountable.
 *
 * Any interaction with `MessageInbox` must come after this.
 */
export async function gotoMessages(page: Page): Promise<void> {
  const traffic = observeInboxTraffic(page);

  try {
    // Race-safe nav (see helpers/login.ts comment on the Promise.all pattern).
    await Promise.all([
      page.waitForURL('**/messages'),
      page.getByRole('link', { name: 'Messages' }).click(),
    ]);

    await expectInboxReady(page, traffic);
  } finally {
    traffic.stop();
  }
}

/**
 * DO NOT ADD A `reloadMessages()` HELPER — and do not `page.reload()` or
 * `page.goto()` inside an authenticated messaging test.
 * ---------------------------------------------------------------------------
 * The access token lives ONLY in module memory (`lib/auth-token-holder.ts`,
 * Story 9-49/ADR-022), so a hard page load drops it and the session must be
 * rebuilt by the boot `/auth/refresh` from the httpOnly cookie
 * (AuthContext:588-645). There is no race with `ProtectedRoute` — `isLoading`
 * starts true and the guard renders a skeleton until that refresh settles.
 *
 * The problem is that in THIS suite the refresh cookie is not reliably valid.
 * Every spec logs in as the same seeded `supervisor@dev.local`, and the API is
 * **single-session by design**: each login reaps the user's previous refresh token
 * (token.service.ts:146, "AT-MOST-ONE active refresh token per user"). Parallel
 * workers therefore invalidate one another, so whoever reloads after a sibling has
 * logged in gets 401 → AUTH_LOGOUT → the PUBLIC HOME PAGE, where no inbox anchor
 * can ever appear.
 *
 * Probed 2026-07-27 while reviewing 13-36, and the split is clean:
 *   - `--workers=1` (lone session):     5/5 pass, `/auth/refresh` → [200, 200]
 *   - `--workers=4 --repeat-each=8`:    5/8 fail, `/auth/refresh` → [401, 401], url `/`
 * So this is a SHARED-FIXTURE artifact, not a product defect — a real user pressing
 * F5 keeps their session. Written down because the symptom (page never reaches the
 * inbox) is indistinguishable from the §6d "query never issued" signature.
 *
 * The suite is now pinned to `workers: 1` (playwright.config.ts), which removes the
 * conflict at its source — so a reload is no longer *unsafe* here. These tests still
 * avoid it because it buys only a weak property (proof the list came from the API
 * rather than the cache) for a full auth-boot chain of 2-5s; navigating with the app
 * keeps the in-memory token and is faster. If you ever need the stronger property
 * back, a reload is legitimate — just keep the explicit budget, and do NOT raise the
 * worker count to compensate for the slower run.
 */

/**
 * The data-ready gate: the thread list renders only on the loaded branch — the
 * skeleton has no role="list" (SupervisorMessagesPage.tsx:100 vs MessageInbox.tsx:49),
 * and the empty state renders INSIDE this same list, so it is a valid anchor whether
 * or not the supervisor has threads.
 *
 * Waits for the list OR the page's error branch, so a failed fetch reports itself
 * immediately instead of burning the full budget on a locator that will never
 * appear. That distinction matters here: the query is `retry: 1` (App.tsx:225) and
 * the Messages page offers no manual retry, so ONE transient failure is terminal
 * for the page — a genuinely red test, but it must say so in its own words.
 *
 * `traffic` is optional only so this stays usable from a bespoke call site; every
 * helper in this file passes one. When it is absent the failure message says the
 * traffic is UNKNOWN rather than claiming none occurred (review AI-3).
 */
export async function expectInboxReady(page: Page, traffic?: InboxTraffic): Promise<void> {
  const threadList = page.getByRole('list', { name: 'Message threads' });
  const loadFailed = page.getByText('Failed to load messages');

  const describeTraffic = () => {
    if (!traffic) {
      return '(UNKNOWN — this call site attached no traffic listener; route through gotoMessages(),'
        + ' or attach observeInboxTraffic() yourself, to get real network diagnostics here)';
    }
    return traffic.lines.length
      ? traffic.lines.join(', ')
      : '(none — no response and no request failure was observed)';
  };

  try {
    await expect(threadList.or(loadFailed).first()).toBeVisible({ timeout: DATA_READY_TIMEOUT });
  } catch (cause) {
    // Neither anchor painted. DO NOT assert why — OBSERVE it. The old message here
    // declared "never left its LOADING skeleton" without ever checking that the
    // skeleton was on screen, which is the same not-looking-then-claiming defect as
    // review AI-3: the page may equally have been redirected off /messages entirely
    // (a dead session lands on the public home page, where no anchor can exist).
    // Each fact below is measured at failure time.
    const url = page.url();
    const onMessages = /\/messages(\/|$|\?)/.test(url);
    const skeletonUp = await page.getByLabel('Loading messages').isVisible().catch(() => false);
    const online = await page.evaluate(() => navigator.onLine).catch(() => null);
    const pending = traffic?.pending() ?? [];
    const authSeen = traffic?.auth ?? [];

    // Name the diagnosis ONLY when the evidence identifies it; otherwise say so and
    // hand over the raw observations. A wrong confident answer here is worse than
    // none — it is what sent this story's earlier skips down the wrong path.
    let verdict: string;
    if (!onMessages) {
      verdict =
        `DIAGNOSIS: the page is no longer on /messages (it is at ${url}).\n` +
        '  The inbox anchors cannot exist here — this is a LOST SESSION, not a slow query.\n' +
        '  Most likely the boot /auth/refresh was rejected: this API is single-session by design\n' +
        '  (token.service.ts:146 reaps the previous refresh token on every login), so a parallel\n' +
        '  worker logging in as the SAME seeded account invalidates this one. Do not reload or\n' +
        "  re-navigate an authed page inside this suite — see this file's header note.";
    } else if (pending.some((p) => p === 'auth/refresh')) {
      verdict =
        'DIAGNOSIS: a /auth/refresh request is STILL IN FLIGHT and never settled.\n' +
        '  apiClient awaits awaitAccessToken() BEFORE calling fetch (api-client.ts:52), so every\n' +
        '  authed request — including the inbox query — is queued behind that refresh and NO\n' +
        '  request is ever issued. The query stays `pending` forever, so it never errors and\n' +
        '  never retries: the page sits on its skeleton. Look at the API server, not the test.';
    } else if (online === false) {
      verdict =
        'DIAGNOSIS: the BROWSER WAS OFFLINE. TanStack pauses queries when the browser reports\n' +
        '  offline (networkMode "online"), so no request is issued and the page waits forever.\n' +
        '  This is a host/network condition, not a product or test defect.';
    } else if (traffic && traffic.lines.length === 0) {
      verdict =
        'DIAGNOSIS: UNRESOLVED — on /messages, skeleton ' + (skeletonUp ? 'up' : 'NOT up') + ',\n' +
        '  browser online, no refresh in flight, yet the inbox query issued no request.\n' +
        '  This is a genuinely new signature: capture this output and open a story.';
    } else {
      verdict = 'DIAGNOSIS: the inbox responded but the UI never rendered it — a client-side bug.';
    }

    throw new Error(
      'The Messages page never reached its inbox (neither the thread list nor the error branch).\n' +
        `URL at failure: ${url}\n` +
        `Loading skeleton visible: ${skeletonUp}\n` +
        `Inbox traffic seen: ${describeTraffic()}\n` +
        `Auth-refresh traffic seen: ${authSeen.length ? authSeen.join(', ') : '(none)'}\n` +
        `Requests still in flight: ${pending.length ? pending.join(', ') : '(none)'}\n` +
        `navigator.onLine: ${online === null ? 'unavailable' : String(online)}\n` +
        `${verdict}\n` +
        `Original: ${cause instanceof Error ? cause.message.split('\n')[0] : String(cause)}`,
    );
  }

  if (await loadFailed.isVisible()) {
    throw new Error(
      'The Messages page rendered its ERROR branch — GET /messages/inbox failed, so the inbox ' +
        'chrome (broadcast / new-conversation) never mounts.\n' +
        `Inbox traffic seen: ${describeTraffic()}\n` +
        'The query is retry:1 with no manual retry on the page (App.tsx:225), so one transient ' +
        'API failure is terminal for the page. Check the API server log at that timestamp.',
    );
  }
}

/**
 * Open the "New Conversation" team-roster picker and wait for the roster data.
 *
 * The picker's `role="list"` container renders IMMEDIATELY (including while
 * loading — TeamRosterPicker.tsx:84 wraps the skeleton branch too), so asserting
 * on the container alone is a false-green: it passes over placeholders. The gate
 * below is therefore a POSITIVE assertion on the SETTLED branches — never on the
 * absence of a skeleton, which would pass trivially before the skeleton has even
 * mounted.
 *
 * All THREE settled branches are anchors (TeamRosterPicker.tsx:85-108): real roster
 * rows, the loaded "no team members" state, and the ERROR state. Omitting the error
 * branch — as the first cut did — means a failed roster fetch matches nothing, so
 * the helper burns the full budget and dies with an anonymous `toBeVisible` timeout
 * at exactly the moment something is genuinely broken (review AI-1).
 *
 * Requires `gotoMessages()` first (the button lives in the inbox header).
 */
export async function openTeamRoster(page: Page): Promise<void> {
  // Exact aria-label match to disambiguate from the empty-state button
  // ("Start a new conversation from empty inbox") — MessageInbox.tsx:30 vs :97.
  await page.getByRole('button', { name: 'Start a new conversation', exact: true }).click();
  await expect(page.getByTestId('team-roster-picker')).toBeVisible();

  const roster = page.getByRole('list', { name: 'Team members' });
  // Roster entries are <button role="listitem"> — the explicit role wins over the
  // implicit one (TeamRosterPicker.tsx:115), which is why `getByRole('button')`
  // finds nothing here.
  const rows = roster.getByRole('listitem', { name: /^Start conversation with/ });
  // Both non-row branches are scoped to the roster container: the same
  // "No team members assigned" string also renders on the supervisor productivity
  // page (SupervisorProductivityPage.tsx:270), and an unscoped match there would be
  // a false-green waiting to happen (review AI-12).
  const rosterEmpty = roster.getByText(/No team members/);
  const rosterError = roster.getByTestId('roster-error');

  try {
    await expect(rows.first().or(rosterEmpty).or(rosterError).first()).toBeVisible({
      timeout: DATA_READY_TIMEOUT,
    });
  } catch (cause) {
    throw new Error(
      'The team-roster picker never left its LOADING skeleton — the roster query never settled.\n' +
        'None of the three settled branches painted (roster rows / "no team members" / the error ' +
        'state), so the picker is still showing placeholders.\n' +
        `Original: ${cause instanceof Error ? cause.message.split('\n')[0] : String(cause)}`,
    );
  }

  if (await rosterError.isVisible()) {
    throw new Error(
      'The team-roster picker rendered its ERROR branch — the team-metrics fetch failed, so no ' +
        'enumerator rows exist to click (TeamRosterPicker.tsx:85-90).\n' +
        'This is a real failure, NOT a load race: check the API server log for ' +
        'GET /supervisor/team-metrics at that timestamp.',
    );
  }
}
