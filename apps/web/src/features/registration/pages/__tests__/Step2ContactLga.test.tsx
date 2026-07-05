// @vitest-environment jsdom

/**
 * Story 13-16 (AC1) — the Step 2 LGA select writes the SLUG (`lga.code`), the
 * canonical `respondents.lga_id` vocabulary shared with the enumerator form
 * and every analytics join. Also pins the stale-draft remap: a resumed draft
 * holding the pre-13-16 row UUID (`lga.id`) is remapped to the slug once the
 * public LGA list loads.
 */
import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Step2ContactLga } from '../Step2ContactLga';
import { fetchPublicLgas, type WizardDraftData } from '../../api/wizard.api';

expect.extend(matchers);
afterEach(cleanup);

vi.mock('../../api/wizard.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/wizard.api')>();
  return { ...actual, fetchPublicLgas: vi.fn() };
});
const mockedLgas = vi.mocked(fetchPublicLgas);

const EGBEDA_UUID = '018e5f2a-1234-7890-abcd-1234567890ab';
const LGAS = [
  { id: EGBEDA_UUID, name: 'Egbeda', code: 'egbeda' },
  { id: '018e5f2a-5678-7890-abcd-1234567890cd', name: 'Ibadan North', code: 'ibadan_north' },
];

function renderStep2(formData: Partial<WizardDraftData> = {}, mergeFields = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <Step2ContactLga
        formData={formData as WizardDraftData}
        mergeFields={mergeFields}
        onContinue={vi.fn()}
        onBack={vi.fn()}
      />
    </QueryClientProvider>,
  );
  return { mergeFields };
}

describe('Step2ContactLga LGA slug write (Story 13-16 AC1)', () => {
  beforeEach(() => {
    mockedLgas.mockReset();
    mockedLgas.mockResolvedValue(LGAS);
  });

  it('renders LGA options whose value is the slug (lga.code), not the row UUID', async () => {
    renderStep2();
    const option = (await screen.findByRole('option', { name: 'Egbeda' })) as HTMLOptionElement;
    expect(option.value).toBe('egbeda');
    const option2 = screen.getByRole('option', { name: 'Ibadan North' }) as HTMLOptionElement;
    expect(option2.value).toBe('ibadan_north');
  });

  it('remaps a stale UUID draft value to the slug once the LGA list loads', async () => {
    const { mergeFields } = renderStep2({ lgaId: EGBEDA_UUID });
    await waitFor(() => expect(mergeFields).toHaveBeenCalledWith({ lgaId: 'egbeda' }));
  });

  it('leaves a slug draft value untouched (no remap churn)', async () => {
    const { mergeFields } = renderStep2({ lgaId: 'egbeda' });
    await screen.findByRole('option', { name: 'Egbeda' });
    expect(mergeFields).not.toHaveBeenCalled();
  });
});
