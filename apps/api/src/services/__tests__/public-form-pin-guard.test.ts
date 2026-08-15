/**
 * Story 13-57 AC5.2 — the pin guard.
 *
 * Pinning `wizard.public_form_id` is the moment a form is declared to be THE
 * one feeding the public register, and a re-upload makes re-pinning mandatory
 * ([[project_public_wizard_form_update]]). So it is also the moment a renamed
 * or dropped question would start costing real registrations in silence, with
 * the whole public channel behind it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NativeFormSchema } from '@oslsr/types';

const { mockFindFirstForm } = vi.hoisted(() => ({ mockFindFirstForm: vi.fn() }));

vi.mock('../../db/index.js', () => ({
  db: {
    query: {
      questionnaireForms: { findFirst: (...args: unknown[]) => mockFindFirstForm(...args) },
    },
  },
}));

const { assertPinnedFormHonoursIngestionContract, PUBLIC_FORM_SETTING_KEY } = await import(
  '../public-form-pin-guard.js'
);

function schemaWith(questionNames: string[]): NativeFormSchema {
  return {
    id: 'form-test',
    title: 'Pin Test',
    version: '1.0.0',
    status: 'published',
    sections: [
      {
        id: 's1',
        title: 'All',
        questions: questionNames.map((name, i) => ({
          id: `q${i}`,
          type: name.startsWith('consent_') ? 'select_one' : 'text',
          name,
          label: name,
          required: true,
          ...(name.startsWith('consent_') ? { choices: 'yes_no' } : {}),
        })),
      },
    ],
    choiceLists: { yes_no: [{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }] },
    createdAt: '2026-01-01T00:00:00.000Z',
  } as NativeFormSchema;
}

const COMPLETE = ['nin', 'firstname', 'surname', 'phone_number', 'lga_id', 'consent_marketplace'];

beforeEach(() => {
  mockFindFirstForm.mockReset();
});

describe('assertPinnedFormHonoursIngestionContract', () => {
  it('allows a form that carries the whole contract', async () => {
    mockFindFirstForm.mockResolvedValue({ id: 'f1', formSchema: schemaWith(COMPLETE) });
    await expect(
      assertPinnedFormHonoursIngestionContract(PUBLIC_FORM_SETTING_KEY, 'f1'),
    ).resolves.toBeUndefined();
  });

  it('BLOCKS a form that dropped a field ingestion reads by name, naming field and consumer', async () => {
    mockFindFirstForm.mockResolvedValue({
      id: 'f1',
      formSchema: schemaWith(COMPLETE.filter((n) => n !== 'phone_number')),
    });

    await expect(
      assertPinnedFormHonoursIngestionContract(PUBLIC_FORM_SETTING_KEY, 'f1'),
    ).rejects.toMatchObject({
      code: 'FORM_INGESTION_CONTRACT_VIOLATION',
      statusCode: 422,
    });

    // The message has to be usable by someone holding the workbook.
    await expect(
      assertPinnedFormHonoursIngestionContract(PUBLIC_FORM_SETTING_KEY, 'f1'),
    ).rejects.toThrow(/`phone_number`/);
    await expect(
      assertPinnedFormHonoursIngestionContract(PUBLIC_FORM_SETTING_KEY, 'f1'),
    ).rejects.toThrow(/identity guard/);
  });

  /**
   * ⚠️ The guard must not become a cage. Taking the questionnaire step offline
   * is a legitimate operator action — and refusing it would leave someone
   * unable to switch off a form that is actively causing harm.
   */
  it('allows UNPINNING (null), which takes the questionnaire step offline deliberately', async () => {
    await expect(
      assertPinnedFormHonoursIngestionContract(PUBLIC_FORM_SETTING_KEY, null),
    ).resolves.toBeUndefined();
    expect(mockFindFirstForm).not.toHaveBeenCalled();
  });

  it('is a no-op for every other setting key — it must not touch the DB at all', async () => {
    await expect(
      assertPinnedFormHonoursIngestionContract('auth.sms_otp_enabled', true),
    ).resolves.toBeUndefined();
    expect(mockFindFirstForm).not.toHaveBeenCalled();
  });

  /**
   * A pin pointing at nothing is a different mistake, already reported by the
   * renderer (PUBLIC_FORM_NOT_CONFIGURED). Inventing a contract error for it
   * would send the operator looking for a missing question that does not exist.
   */
  it('stays silent when the id points at no form — that is not a contract failure', async () => {
    mockFindFirstForm.mockResolvedValue(undefined);
    await expect(
      assertPinnedFormHonoursIngestionContract(PUBLIC_FORM_SETTING_KEY, 'nope'),
    ).resolves.toBeUndefined();
  });
});
