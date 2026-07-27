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

/** A live record of inbox network activity, used ONLY to explain a failure. */
interface InboxTraffic {
  readonly lines: string[];
  stop(): void;
}

/**
 * Observe the inbox call purely for DIAGNOSTICS — never as a gate (see the header
 * note). If the page ends up on its error branch, these lines turn an anonymous
 * 20s timeout into "the API returned 503" / "ECONNREFUSED".
 *
 * Must be attached BEFORE the action that triggers the fetch, or the response
 * event fires before anyone is listening and the record is silently empty.
 */
function observeInboxTraffic(page: Page): InboxTraffic {
  const lines: string[] = [];

  const onResponse = (response: { url(): string; status(): number }) => {
    if (response.url().includes(INBOX_ENDPOINT)) lines.push(`HTTP ${response.status()}`);
  };
  const onRequestFailed = (request: { url(): string; failure(): { errorText: string } | null }) => {
    if (request.url().includes(INBOX_ENDPOINT)) {
      lines.push(`request failed: ${request.failure()?.errorText ?? 'unknown'}`);
    }
  };

  page.on('response', onResponse);
  page.on('requestfailed', onRequestFailed);

  return {
    lines,
    stop() {
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
 * The access token lives in memory (AuthContext `saveToken`), so a hard page load
 * drops it and the session has to be re-established by a silent refresh. That
 * refresh races `ProtectedRoute`'s `isAuthenticated` check: when it loses, the
 * guard redirects away and the test lands on the PUBLIC HOME PAGE, where the
 * inbox anchors can never appear.
 *
 * Measured 2026-07-27 while reviewing 13-36: a reload-based test failed **2 of 3
 * runs** locally (the surviving run is the one where the refresh won the race).
 * The symptom is indistinguishable from the §6d "query never issued" signature,
 * which is exactly why it must be written down here rather than re-derived.
 *
 * Need the inbox re-rendered from the server? Navigate with the app instead
 * (click a sidebar link), which keeps the in-memory token intact.
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
    // Neither branch painted → the page is still on its loading skeleton, i.e. the
    // query never settled. Attach the observed traffic: it separates "the API never
    // answered" (no lines / a failure line) from "the API answered but the UI never
    // rendered it" (an `HTTP 200` line), which are completely different bugs.
    // TanStack pauses queries (networkMode 'online' default) whenever the browser
    // reports offline: status stays pending, NO request is issued, and the page
    // sits on its skeleton forever. Capturing this turns "mystery hang" into
    // "the machine's network flapped" — the two demand opposite responses.
    //
    // The offline hypothesis is only offered when a listener was actually attached
    // AND saw nothing. Without a listener, "nothing seen" is an artefact of not
    // looking and must not be presented as evidence (review AI-3).
    const sawNothing = !!traffic && traffic.lines.length === 0;
    const online = sawNothing ? await page.evaluate(() => navigator.onLine).catch(() => null) : null;

    throw new Error(
      'The Messages page never left its LOADING skeleton — the inbox query never settled.\n' +
        `Inbox traffic seen: ${describeTraffic()}\n` +
        (sawNothing
          ? `navigator.onLine at failure: ${online === null ? 'unavailable' : String(online)}` +
            (online === false
              ? '  ← BROWSER WAS OFFLINE: TanStack pauses queries when offline, so no request was ever'
                + ' sent. This is a host/network condition, not a product or test defect.\n'
              : '\n')
          : '') +
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
