import { describe, it, expect } from 'vitest';
import { deriveStep5State } from '../Step5NinAndAuth';
import type { WizardDraftData } from '../../api/wizard.api';

/**
 * Story 9-12 Task 5.5.4 — dispatcher state-derivation tests.
 *
 * Pure-function tests for `deriveStep5State`. Validates the truth table
 * across all three states A / B / C documented in Dev Notes "Step 5 NIN
 * handling — state-aware dispatcher".
 *
 * NIN fixtures use checksum-valid 11-digit values (from
 * packages/utils/src/__tests__/validation.test.ts) so the dispatcher's
 * Modulus-11 check accepts them. Junk 11-digit strings like '12345678901'
 * intentionally do NOT satisfy Modulus-11 and so cannot be used here.
 */

const VALID_NIN = '61961438053';
const ANOTHER_VALID_NIN = '21647846180';

describe('Step5 dispatcher — deriveStep5State', () => {
  it('returns A when the questionnaire collected a valid 11-digit NIN', () => {
    const formData: WizardDraftData = {
      formHasNinQuestion: true,
      questionnaireResponses: { nin: VALID_NIN },
    };
    expect(deriveStep5State(formData)).toBe('A');
  });

  it('returns A when the NIN landed under the legacy `national_id` key', () => {
    const formData: WizardDraftData = {
      formHasNinQuestion: true,
      questionnaireResponses: { national_id: ANOTHER_VALID_NIN },
    };
    expect(deriveStep5State(formData)).toBe('A');
  });

  it('returns C when the questionnaire NIN value is shape-valid but fails Modulus-11', () => {
    // Junk 11-digit string — '12345678901' is the canonical fail-mod-11
    // fixture. Pre-2026-05-12 the State A path accepted these (shape-only
    // check); the hotfix wires modulus11Check in so State A only fires
    // when the questionnaire's NIN actually validates.
    const formData: WizardDraftData = {
      formHasNinQuestion: true,
      questionnaireResponses: { nin: '12345678901' },
    };
    expect(deriveStep5State(formData)).toBe('C');
  });

  it('returns B when pendingNinToggle is true (form has NIN question)', () => {
    const formData: WizardDraftData = {
      formHasNinQuestion: true,
      pendingNinToggle: true,
    };
    expect(deriveStep5State(formData)).toBe('B');
  });

  it('returns B when pending toggle is true even if a NIN value is also present', () => {
    const formData: WizardDraftData = {
      formHasNinQuestion: true,
      pendingNinToggle: true,
      questionnaireResponses: { nin: VALID_NIN },
    };
    // Pending takes precedence — user explicitly chose to defer.
    expect(deriveStep5State(formData)).toBe('B');
  });

  it('returns C when the form has no NIN question', () => {
    const formData: WizardDraftData = {
      formHasNinQuestion: false,
    };
    expect(deriveStep5State(formData)).toBe('C');
  });

  it('returns C when formHasNinQuestion is unset (legacy / missing introspection)', () => {
    expect(deriveStep5State({})).toBe('C');
  });

  it('returns C when the form has a NIN question but neither value nor toggle is set (recovery)', () => {
    const formData: WizardDraftData = {
      formHasNinQuestion: true,
      questionnaireResponses: {},
    };
    expect(deriveStep5State(formData)).toBe('C');
  });

  it('ignores non-11-digit values in the questionnaire (treats as missing)', () => {
    const formData: WizardDraftData = {
      formHasNinQuestion: true,
      questionnaireResponses: { nin: '123' },
    };
    expect(deriveStep5State(formData)).toBe('C');
  });
});
