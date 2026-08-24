import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockSaveWizardDraft = vi.fn();
const mockFetchWizardDraft = vi.fn();

vi.mock('../../api/wizard.api', () => ({
  saveWizardDraft: (...a: unknown[]) => mockSaveWizardDraft(...a),
  fetchWizardDraft: (...a: unknown[]) => mockFetchWizardDraft(...a),
}));

const { useWizardDraft } = await import('../useWizardDraft');

/**
 * Story 13-50 AC4.3 — "simulate the autosave sequence `a@gmail.c` → `a@gmail.co` →
 * `a@gmail.com` and assert ONE draft row results, not three."
 *
 * The gate itself is unit-tested in `lib/__tests__/draft-email-gate.test.ts`. This exercises the
 * thing that actually writes rows: the debounced autosave in `useWizardDraft`. It is deliberately
 * the *pausing* sequence — each address is left to sit past the 2s debounce, which is exactly how
 * the four real phantoms were created. A test that typed straight through would pass even with
 * the gate deleted, because the debounce alone would collapse the writes: that would be a test
 * passing over the hole rather than through it.
 */
describe('13-50 AC4.3 — the autosave sequence yields ONE draft, not three', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockSaveWizardDraft.mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Type a value and let the full debounce elapse, as a hesitating registrant does. */
  const typeAndPause = async (
    setField: (k: 'email', v: string) => void,
    value: string,
  ) => {
    await act(async () => {
      setField('email', value);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
  };

  it('writes exactly one draft, under the finished address only', async () => {
    const { result } = renderHook(() => useWizardDraft());

    await typeAndPause(result.current.setField, 'a@gmail.c');
    await typeAndPause(result.current.setField, 'a@gmail.co');
    await typeAndPause(result.current.setField, 'a@gmail.com');

    expect(mockSaveWizardDraft).toHaveBeenCalledTimes(1);
    expect(mockSaveWizardDraft).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'a@gmail.com' }),
    );
  });

  it.each([
    'yusuffasiat@gmail.co',
    'dayoariremako88@gmail.co',
    'ogunbonadamola@gmail.co',
    'aladechristianahtosin@gmail.co',
  ])('never writes a draft under the real phantom %s', async (phantom) => {
    const { result } = renderHook(() => useWizardDraft());
    await typeAndPause(result.current.setField, phantom);
    expect(mockSaveWizardDraft).not.toHaveBeenCalled();
  });

  it('still autosaves a normal address — the gate is not a blanket block', async () => {
    const { result } = renderHook(() => useWizardDraft());
    await typeAndPause(result.current.setField, 'bisi@gmail.com');
    expect(mockSaveWizardDraft).toHaveBeenCalledTimes(1);
  });

  /**
   * ── CODE REVIEW 2026-08-24 (M4) — A DECLINED SAVE MUST CANCEL, NOT JUST DECLINE ────────────
   *
   * The gate returned before `clearTimeout`, so a write armed by an EARLIER persistable value
   * still fired — closing over the address it was scheduled with. Backspacing inside the 2s
   * debounce therefore created a draft row under an address the registrant had just abandoned:
   * the same "a row for somebody who never used it" producer AC4 exists to close, and invisible
   * to the AC5 prefix sweep because here the abandoned address is the LONGER one.
   */
  it('cancels an armed write when the address stops being persistable', async () => {
    const { result } = renderHook(() => useWizardDraft());

    await act(async () => {
      result.current.setField('email', 'a@gmail.com'); // persistable → timer armed
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500); // still inside the 2s debounce
      result.current.setField('email', 'a@gmail.co'); // now a known typo domain → declined
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(mockSaveWizardDraft).not.toHaveBeenCalled();
  });

  /**
   * ── CODE REVIEW 2026-08-24 (L3) — THE COMMITTED BOUNDARY IS LOAD-BEARING AND WAS UNTESTED ──
   *
   * `emailCommitted = latestStepIndex >= 2` encodes "past Step 2", because Step 2 (`contact`) is
   * index 1 and index 2 (`consent`) is only reachable through its Continue. Nothing pinned that
   * number: changing it to `>= 1` would treat somebody still typing ON Step 2 as committed and
   * re-open the phantom window, and every test stayed green.
   */
  it('index 1 (still ON Step 2) does NOT count as committed', async () => {
    const { result } = renderHook(() => useWizardDraft());
    // ⚠️ ORDER MATTERS, and getting it wrong makes this test pass over the hole it guards:
    // `setField` schedules with the step index captured at call time, so setting the index and
    // the email in one act never reaches the boundary at all. Set the address first, then move.
    await act(async () => {
      result.current.setField('email', 'real@mail.com'); // typo-dictionary domain
    });
    await act(async () => {
      result.current.setCurrentStepIndex(1); // still ON Step 2, not past it
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(mockSaveWizardDraft).not.toHaveBeenCalled();
  });

  it('index 2 (past Step 2) honours the address the registrant committed', async () => {
    const { result } = renderHook(() => useWizardDraft());
    await act(async () => {
      result.current.setField('email', 'real@mail.com'); // declined while still on Step 2
    });
    await act(async () => {
      result.current.setCurrentStepIndex(2); // Continue on Step 2 lands here
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(mockSaveWizardDraft).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'real@mail.com', currentStep: 3 }),
    );
  });
});
