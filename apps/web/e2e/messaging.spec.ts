import { test, expect } from '@playwright/test';
import { staffLogin } from './helpers/login';

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
 * @see prep-7-e2e-test-expansion.md
 * @see 4-2-in-app-team-messaging.md
 * @see prep-1-fix-supervisor-direct-messaging-ux.md
 */

test.describe('Supervisor Messaging', () => {
  test.beforeEach(async ({ page }) => {
    await staffLogin(page, 'supervisor');
  });

  test('navigate to messages page', async ({ page }) => {
    // Navigate via sidebar link
    await page.getByRole('link', { name: 'Messages' }).click();
    await page.waitForURL('**/messages');

    // Verify the messages page loads (inbox or empty state)
    // Either the inbox list renders or the empty state message appears
    const inboxList = page.getByRole('list', { name: 'Message threads' });
    const emptyState = page.getByText('No messages yet');
    await expect(inboxList.or(emptyState)).toBeVisible();
  });

  test('send a broadcast message and verify it appears in inbox', async ({ page }) => {
    const broadcastText = `[E2E-BROADCAST] Test broadcast ${Date.now()}`;

    // Navigate to Messages
    await page.getByRole('link', { name: 'Messages' }).click();
    await page.waitForURL('**/messages');

    // Click "Broadcast to Team" button
    await page.getByRole('button', { name: /broadcast to team/i }).click();

    // Verify broadcast composer loads
    await expect(page.getByText('Broadcast to Team')).toBeVisible();
    await expect(page.getByText('Send a message to all your assigned enumerators')).toBeVisible();

    // Type broadcast message
    const composer = page.getByLabel('Message input');
    await expect(composer).toBeVisible();
    await composer.fill(broadcastText);

    // Send the broadcast
    await page.getByRole('button', { name: 'Send message' }).click();

    // Verify the broadcast appears in inbox (inbox refreshes after send)
    await expect(page.getByText(broadcastText).first()).toBeVisible({ timeout: 15000 });
  });

  test('open a thread and verify messages render', async ({ page }) => {
    // First, send a broadcast to ensure at least 1 thread exists
    const broadcastText = `[E2E-THREAD] Thread test ${Date.now()}`;

    await page.getByRole('link', { name: 'Messages' }).click();
    await page.waitForURL('**/messages');

    // Send a broadcast to guarantee inbox has content
    await page.getByRole('button', { name: /broadcast to team/i }).click();
    const composer = page.getByLabel('Message input');
    await composer.fill(broadcastText);
    await page.getByRole('button', { name: 'Send message' }).click();

    // Wait for inbox to show the thread
    await expect(page.getByText(broadcastText).first()).toBeVisible({ timeout: 15000 });

    // Click the thread containing our broadcast text (not just .first() — avoids flaky ordering)
    // eslint-disable-next-line no-restricted-syntax -- A3 exception: starts-with ARIA match for dynamic thread labels (no getByRole equivalent)
    const targetThread = page.locator('[aria-label^="Conversation with"]')
      .filter({ hasText: broadcastText });
    await targetThread.first().click();

    // Verify thread view opens with message log
    const messageLog = page.getByRole('log', { name: 'Message thread' });
    await expect(messageLog).toBeVisible();

    // Verify at least one message bubble is rendered in the thread
    await expect(messageLog.getByTestId('message-bubble').first()).toBeVisible({ timeout: 10000 });
  });

  test('New Conversation flow opens team roster picker', async ({ page }) => {
    // Navigate to Messages
    await page.getByRole('link', { name: 'Messages' }).click();
    await page.waitForURL('**/messages');

    // Click "New Conversation" button
    await page.getByRole('button', { name: /start a new conversation/i }).click();

    // Verify team roster picker opens
    await expect(page.getByTestId('team-roster-picker')).toBeVisible();
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

  test('start a direct message via New Conversation', async ({ page }) => {
    const directMessage = `[E2E-DM] Direct message ${Date.now()}`;

    // Navigate to Messages
    await page.getByRole('link', { name: 'Messages' }).click();
    await page.waitForURL('**/messages');

    // Open New Conversation roster
    await page.getByRole('button', { name: /start a new conversation/i }).click();
    await expect(page.getByTestId('team-roster-picker')).toBeVisible();

    // Click the first team member to start conversation
    const firstMember = page.getByRole('list', { name: 'Team members' }).getByRole('button').first();
    await firstMember.click();

    // Verify thread view opens (roster closes, composer visible)
    const composerInput = page.getByLabel('Message input');
    await expect(composerInput).toBeVisible({ timeout: 10000 });

    // Type and send a direct message
    await composerInput.fill(directMessage);
    await page.getByRole('button', { name: 'Send message' }).click();

    // Verify the message appears in the thread
    await expect(page.getByText(directMessage)).toBeVisible({ timeout: 15000 });
  });
});
