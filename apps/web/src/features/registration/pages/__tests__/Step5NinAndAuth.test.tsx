import { describe, it, expect } from 'vitest';
import { deriveStep5State } from '../Step5NinAndAuth';
import type { WizardDraftData } from '../../api/wizard.api';

/**
 * Story 9-12 Task 5.5.4 — dispatcher state-derivation tests.
 *
 * Pure-function tests for `deriveStep5State`. Validates the truth table
 * across all three states A / B / C documented in Dev Notes "Step 5 NIN
 * handling — state-aware dispatcher".
 */

describe('Step5 dispatcher — deriveStep5State', () => {
  it('returns A when the questionnaire collected a valid 11-digit NIN', () => {
    const formData: WizardDraftData = {
      formHasNinQuestion: true,
      questionnaireResponses: { nin: '12345678901' },
    };
    expect(deriveStep5State(formData)).toBe('A');
  });

  it('returns A when the NIN landed under the legacy `national_id` key', () => {
    const formData: WizardDraftData = {
      formHasNinQuestion: true,
      questionnaireResponses: { national_id: '12345678901' },
    };
    expect(deriveStep5State(formData)).toBe('A');
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
      questionnaireResponses: { nin: '12345678901' },
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
