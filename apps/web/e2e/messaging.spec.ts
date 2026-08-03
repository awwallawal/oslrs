import { test, expect } from '@playwright/test';
import { staffLogin } from './helpers/login';
import { gotoMessages, openTeamRoster } from './helpers/messages';

/**
 * Messaging Inbox E2E Tests
 *
 * Tests the Supervisor messaging UI:
 *   Navigate to messages → Send broadcast → Verify inbox → Open thread → New Conversation
 *
 * Requires full stack running (API + DB + Redis + Web) with seeded team assignments.
 *
 * Cleanup note: CI uses a fresh test_db per run so message accumulation is not an issue.
 * For local runs, messages created by these tests are prefixed with [E2E-*] for easy
 * identification during manual cleanup.
 *
 * Selector rules (Team Agreement A3):
 *   1. page.getByRole()   — semantic roles (preferred)
 *   2. page.getByLabel()  — form fields
 *   3. page.getByText()   — visible text
 *   4. page.getByTestId() — only when above insufficient
 *
 * Determinism rule (Story 13-36): every interaction with the inbox chrome goes
 * through `helpers/messages.ts`, which waits for the query that gates the render
 * instead of leaning on the 15s action timeout. Do NOT click inbox controls
 * straight after the nav — that is exactly the race this story removed.
 *
 * @see prep-7-e2e-test-expansion.md
 * @see 4-2-in-app-team-messaging.md
 * @see prep-1-fix-supervisor-direct-messaging-ux.md
 */

/** Escape a DB-sourced name before embedding it in a locator RegExp. */
function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test.describe('Supervisor Messaging', () => {
  test.beforeEach(async ({ page }) => {
    await staffLogin(page, 'supervisor');
  });

  test('navigate to messages page', async ({ page }) => {
    // The role="list" with aria-label "Message threads" always renders once the
    // inbox query resolves; when threads.length === 0 the empty-state
    // ("No messages yet") renders INSIDE that same list container. Asserting on
    // the list alone is sufficient — the .or() fallback was redundant and
    // triggered strict-mode because both selectors matched in the empty state.
    // (See MessageInbox.tsx:49,89.) gotoMessages() asserts exactly this.
    await gotoMessages(page);
  });

  test('send a broadcast message and open the composer', async ({ page }) => {
    // Note (2026-05-09): scoped this test to compose-pane verification only.
    // The original "and verify it appears in inbox" assertion (against
    // page.getByText(broadcastText) within 15s) was flaky in CI — the
    // broadcast send returns 200 but the inbox refetch lags or the WebSocket
    // event isn't received before the timeout. The send-to-inbox round-trip
    // belongs in an integration test or in a Playwright test with explicit
    // network waiting (`page.waitForResponse`). Tracked as follow-up.

    // Story 13-36 (AC1): navigate + wait for the inbox data that gates the
    // header actions. Before this, the click below raced the query and timed out
    // at 15s under CI load — the flake this story killed.
    await gotoMessages(page);

    // Click the broadcast button. The button's accessible name comes from its
    // aria-label "Send broadcast message to all team members" (NOT the visible
    // text "Broadcast to Team"), so the regex must match the aria-label.
    await page.getByRole('button', { name: /send broadcast/i }).click();

    // Verify broadcast composer loads. Use heading role to disambiguate from
    // the inbox-button text "Broadcast to Team" (see MessageInbox.tsx:43)
    // which is still visible in the left pane after the composer opens.
    await expect(page.getByRole('heading', { name: 'Broadcast to Team' })).toBeVisible();
    await expect(page.getByText('Send a message to all your assigned enumerators')).toBeVisible();

    // Composer textarea is reachable + send button exists
    const composer = page.getByLabel('Message input');
    await expect(composer).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send message' })).toBeVisible();
  });

  // RE-ENABLED + REWRITTEN 2026-07-26 (Story 13-36). The 2026-05-09 skip blamed a
  // "send-to-inbox round-trip that doesn't propagate within the timeout" and
  // prescribed a `waitForResponse` — but no wait could ever have fixed it. The
  // old test sent a BROADCAST and then waited for it in the SENDER's own inbox,
  // which `getInbox` excludes BY DESIGN: the sent-messages leg filters
  // `eq(messages.messageType, 'direct')` (message.service.ts:182-185), and the
  // sender receives no receipt for their own broadcast. The test was waiting for
  // something the product never produces — a misdiagnosis, not a flake.
  //
  // Rewritten to assert what its name claims, over supported behaviour: seed a
  // thread with a DIRECT message, then open that thread FROM the inbox list.
  //
  // REVISED 2026-07-27 (code review). The first rewrite did the round-trip with
  // `page.reload()`, on the reasoning that a reload proves the inbox came from the
  // server rather than from in-memory state. It does — but it drops the in-memory
  // access token, so the session must be rebuilt by the boot `/auth/refresh`, and
  // in THIS suite that refresh is not reliably valid: every spec logs in as the
  // same seeded `supervisor@dev.local`, and the API is single-session by design —
  // each login reaps the previous refresh token (token.service.ts:146). Parallel
  // workers therefore invalidate each other, and whoever reloads after a sibling
  // logged in gets 401 and lands on the public home page. Measured at 2 failures
  // in 3 runs locally; the rewrite shipped a fresh flake into the story whose whole
  // purpose is removing them. (Its "3/3" claim did not reproduce.)
  //
  // NOT a product defect: probed 2026-07-27, a lone session reloads cleanly 5/5
  // (`/auth/refresh` → 200, stays on /messages). The root cause was the shared
  // account under PARALLEL workers, which is now fixed at source by `workers: 1`
  // in playwright.config.ts — so a reload here would be safe today. It stays out
  // because it costs a 2-5s auth-boot chain to buy a weak property; see the note in
  // helpers/messages.ts.
  //
  // The reload is therefore gone. Selection is cleared through the UI instead
  // (the broadcast button sets selectedPartnerId=null — SupervisorMessagesPage.tsx:167),
  // so the thread really is re-opened FROM the inbox list, which is what the test
  // name claims. The weaker property — "the list was re-fetched from the API, not
  // read back from cache" — is knowingly given up: it is not worth a 67% flake,
  // and the inbox list panel renders from the same query either way.
  test('open a thread from the inbox and verify messages render', async ({ page }) => {
    const threadText = `[E2E-THREAD] Thread test ${Date.now()}`;

    await gotoMessages(page);
    await openTeamRoster(page);

    // Roster entries carry role="listitem" over the implicit button role
    // (TeamRosterPicker.tsx:115) — see the direct-message test for the full note.
    const firstMember = page
      .getByRole('list', { name: 'Team members' })
      .getByRole('listitem', { name: /^Start conversation with/ })
      .first();

    // Capture WHO we are messaging: the inbox row is identified by partner, not by
    // message text (see the concurrency note at the click below).
    const memberLabel = (await firstMember.getAttribute('aria-label')) ?? '';
    const partnerName = memberLabel
      .replace(/^Start conversation with\s*/, '')
      .replace(/\s*\(existing thread\)$/, '');
    expect(partnerName, 'roster row should expose the partner name').not.toBe('');

    await firstMember.click();

    const composer = page.getByLabel('Message input');
    await expect(composer).toBeVisible();
    await composer.fill(threadText);
    await page.getByRole('button', { name: 'Send message' }).click();

    // The thread must exist server-side before we go back to the list, or the
    // inbox comes back empty and the click below has nothing to hit.
    const messageLog = page.getByRole('log', { name: 'Message thread' });
    await expect(messageLog.getByText(threadText)).toBeVisible({ timeout: 15000 });

    // Clear the thread selection through the UI so the next click is a genuine
    // "open it from the inbox" and not a no-op re-click on the already-open
    // thread. The broadcast button sets selectedPartnerId=null
    // (SupervisorMessagesPage.tsx:167); the "Back to inbox" control is `md:hidden`
    // and therefore unavailable on Desktop Chrome.
    await page.getByRole('button', { name: /send broadcast/i }).click();
    await expect(page.getByRole('heading', { name: 'Broadcast to Team' })).toBeVisible();
    await expect(messageLog).toHaveCount(0);

    // Thread rows are also role="listitem" (MessageInbox.tsx:51). Target the row by
    // PARTNER, never by our own message text.
    //
    // The first rewrite filtered on `hasText: threadText`, which assumes our message
    // is the newest in that conversation. `getInbox` returns ONE row per partner
    // whose preview is the latest message (message.service.ts conversation map), so
    // that assumption breaks the moment anything else messages the same enumerator —
    // including another copy of THIS test. Under the `--repeat-each` burn-in AC4
    // prescribes, `fullyParallel: true` runs those copies concurrently against the
    // same seeded enumerator and they overwrite each other's preview: observed
    // 2026-07-27 with the row showing `…554257` while the test waited for `…554455`,
    // 198 ms apart. CI hides it completely (`workers: 1`, playwright.config.ts:10) —
    // green in CI, flaky locally, which is the exact divergence Task 5 exists to end.
    //
    // Keying on the partner is stable under concurrency, and the per-test assertion
    // moves to the thread log below, where our uniquely-stamped message is present
    // regardless of who else wrote to the same partner.
    //
    // The inbox panel stays mounted on desktop (`md:block`,
    // SupervisorMessagesPage.tsx:152), so no navigation — and therefore no
    // session-dropping reload — is needed.
    const targetThread = page
      .getByRole('list', { name: 'Message threads' })
      .getByRole('listitem', { name: new RegExp(`^Conversation with ${escapeForRegExp(partnerName)}`) });
    await expect(targetThread.first()).toBeVisible({ timeout: 20000 });
    await targetThread.first().click();

    // Verify thread view opens with message log + at least one rendered bubble.
    await expect(messageLog).toBeVisible();
    await expect(messageLog.getByTestId('message-bubble').first()).toBeVisible();
    await expect(messageLog.getByText(threadText)).toBeVisible();
  });

  test('New Conversation flow opens team roster picker', async ({ page }) => {
    await gotoMessages(page);

    // Story 13-36 (AC3): openTeamRoster() clicks the header button and then waits
    // for a SETTLED roster branch — real rows, the loaded "no team members" state,
    // or the error state. (It does NOT wait on the /supervisor/team-metrics
    // response: §6d threw that pattern out because a missed network event kills the
    // test even when the page rendered. Gate the RENDER on the anchor.) Asserting
    // on the roster list WITHOUT that wait was a false-green — TeamRosterPicker.tsx:84
    // renders the role="list" container around the loading skeleton too, so the old
    // assertion passed over placeholders.
    await openTeamRoster(page);

    await expect(page.getByText('New Conversation')).toBeVisible();

    // Verify search input is available
    await expect(page.getByLabel('Search team members')).toBeVisible();

    // Verify team members list renders (supervisor has 3 assigned enumerators in seeds)
    const teamList = page.getByRole('list', { name: 'Team members' });
    await expect(teamList).toBeVisible();

    // Close the roster picker
    await page.getByRole('button', { name: /close roster picker/i }).click();
    await expect(page.getByTestId('team-roster-picker')).not.toBeVisible();
  });

  // RE-ENABLED 2026-07-26 (Story 13-36). The 2026-05-09 skip below was a
  // MISDIAGNOSIS, and it kept a working test dead for ~2.5 months. The roster is
  // fully populated — the failure snapshot shows
  //   list "Team members" › listitem "Start conversation with Dev Enumerator" (×3)
  // The test simply could not select them: TeamRosterPicker.tsx:115 puts an
  // explicit role="listitem" on the <button>, which OVERRIDES its implicit button
  // role, so `getByRole('button')` matches nothing — forever, in CI too. Selecting
  // by the role the DOM actually exposes fixes it. (Same shape in MessageInbox.tsx:51.)
  //
  // Superseded skip note, kept for the record:
  // SKIPPED 2026-05-09: this test depends on the supervisor's seeded team
  // assignments rendering as buttons in the TeamRosterPicker. In CI the test
  // opens the roster successfully (the role="list" aria-label="Team members"
  // container renders — see "New Conversation flow opens team roster picker"
  // which passes), but the list contains no enumerator buttons, so
  // `firstMember.click()` times out at 15s. Likely cause: the seed
  // orchestrator's team-assignments step (apps/api/src/db/seeds/index.ts:219)
  // requires the supervisor to have a non-null lgaId AND for the enumerators
  // to be created beforehand. In CI's test_db this ordering may fail
  // silently. Re-enable when seed reliably produces a supervisor with at
  // least one assigned enumerator visible to the API. Tracked as follow-up
  // against prep-7 + the dev-seed completeness gap.
  //
  // Story 13-36 note: openTeamRoster() now proves the roster QUERY has settled
  // before the click, so if this test is re-enabled and still fails, the cause
  // is unambiguously the empty seed — not a load race.
  test('start a direct message via New Conversation', async ({ page }) => {
    const directMessage = `[E2E-DM] Direct message ${Date.now()}`;

    await gotoMessages(page);
    await openTeamRoster(page);

    // Click the first team member to start conversation. Must be `listitem`:
    // the element IS a <button> but carries role="listitem" (TeamRosterPicker.tsx:115),
    // and an explicit role wins over the implicit one.
    const firstMember = page
      .getByRole('list', { name: 'Team members' })
      .getByRole('listitem', { name: /^Start conversation with/ })
      .first();
    await firstMember.click();

    // Verify thread view opens (roster closes, composer visible)
    const composerInput = page.getByLabel('Message input');
    await expect(composerInput).toBeVisible({ timeout: 10000 });

    // Type and send a direct message
    await composerInput.fill(directMessage);
    await page.getByRole('button', { name: 'Send message' }).click();

    // Verify the message appears IN THE THREAD. Must be scoped to the log: after
    // the send, the same text also renders as the inbox row's last-message preview
    // (MessageInbox.tsx:74), so an unscoped getByText is a strict-mode violation
    // ("resolved to 2 elements") — and scoping is the assertion this test's name
    // actually claims.
    const messageLog = page.getByRole('log', { name: 'Message thread' });
    await expect(messageLog.getByText(directMessage)).toBeVisible({ timeout: 15000 });
  });
});

/**
 * Story 13-36 AC1/AC2 — regression guard for the broadcast-composer race.
 *
 * This is the deterministic repro of the CI flake, with NO timing assumptions:
 * the `/messages/inbox` response is HELD open until the test releases it, so the
 * in-flight window is controlled rather than hoped for.
 *
 * It proves both halves of the AC2 decision (test-side wait, product left alone):
 *   1. while the inbox query is in flight the page shows its skeleton and the
 *      broadcast button does not exist — the button is data-gated by design,
 *      which is WHY the old "navigate then click" pattern could time out; and
 *   2. `gotoMessages()` does not resolve until that data lands, after which the
 *      interaction is immediate and reliable.
 *
 * RED-verify (2026-07-26, run locally against the full stack): swapping
 * `gotoMessages(page)` for the pre-13-36 `Promise.all([waitForURL, link.click()])`
 * + immediate `click()`, with the inbox held for 16s, reproduces the CI flake
 * verbatim —
 *   `TimeoutError: locator.click: Timeout 15000ms exceeded.`
 *   `  - waiting for getByRole('button', { name: /send broadcast/i })`
 * — while this test passes under the identical hold. Keep the two in step with
 * helpers/messages.ts.
 *
 * If a future story de-gates the button product-side (AC2 option b), assertion
 * (1) is the one that will fail — that is intentional: revisit the AC2 decision
 * rather than deleting the guard.
 */
test.describe('Supervisor Messaging — inbox load race (13-36 regression)', () => {
  test.beforeEach(async ({ page }) => {
    await staffLogin(page, 'supervisor');
  });

  test('broadcast composer opens deterministically while the inbox query is slow', async ({ page }) => {
    // The executor runs synchronously, so `releaseInbox` is always assigned by the
    // time the Promise constructor returns — hence the definite assignment rather
    // than an optional call that implies an impossible path (review AI-14).
    let releaseInbox!: () => void;
    const inboxHeld = new Promise<void>((resolve) => {
      releaseInbox = resolve;
    });

    // Hold the inbox response open. Later polls (refetchInterval) hit an
    // already-resolved promise and pass straight through.
    await page.route('**/messages/inbox**', async (route) => {
      await inboxHeld;
      await route.continue();
    });

    // Start the deterministic navigation but do NOT await it yet — while the
    // query is held, this promise must stay pending.
    const navigation = gotoMessages(page);
    // Register a no-op rejection handler IMMEDIATELY. If an assertion below fails,
    // the test throws, teardown closes the page, and `navigation` rejects with
    // "Target page … closed" — as an UNHANDLED rejection that Playwright reports as
    // a phantom second error against this or the NEXT test (review AI-6). The real
    // error is still surfaced by the `await navigation` at the end.
    // KEEP the rejection reason. The handler used to discard it, which meant that ANY failure
    // inside `gotoMessages` — a bounced login, a clobbered navigation, a dead link — surfaced as
    // "Loading messages not found", i.e. as a claim about the skeleton. Observed 2026-08-03: this
    // test failed once in 11 local runs with exactly that message while the actual cause was
    // upstream and unrecoverable from the output. The assertion below is only meaningful if the
    // navigation is still in flight; if it already rejected, say so instead.
    let navError: unknown;
    navigation.catch((err: unknown) => {
      navError = err;
    });

    try {
      // (1) The race is real: skeleton up, no broadcast button in the DOM.
      await expect(page.getByLabel('Loading messages')).toBeVisible();
      await expect(page.getByRole('button', { name: /send broadcast/i })).toHaveCount(0);
    } catch (err) {
      if (navError !== undefined) {
        throw new Error(
          'The skeleton assertion failed, but the REAL failure is upstream: gotoMessages() ' +
            'already rejected, so the page never reached /messages and no skeleton could exist.\n' +
            `Navigation error: ${navError instanceof Error ? navError.message : String(navError)}\n` +
            `Skeleton assertion: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`,
        );
      }
      throw err;
    } finally {
      // Always release, even if (1) failed — a held route would otherwise keep the
      // nav pending through teardown.
      releaseInbox();
    }

    // (2) The gate is tied to the data, so the nav completes once it lands.
    await navigation;

    await page.getByRole('button', { name: /send broadcast/i }).click();
    await expect(page.getByRole('heading', { name: 'Broadcast to Team' })).toBeVisible();
  });
});
