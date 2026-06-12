// @vitest-environment jsdom

/**
 * Story 9-54 AC6.3a + AC6.4 — the per-question required gate is the ONLY
 * completeness enforcement the client had, yet EVERY pre-9-54 FormRenderer
 * fixture used `required: false`, leaving the seam untested. These tests lock
 * it in: an empty required field cannot advance via Continue.
 *
 * Also covers AC1 render integration — a computed (`calculate`) field feeds
 * skip-logic so a section/question gated on `${age}` resolves at render.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormRenderer } from '../FormRenderer';
import type { FlattenedForm, FlattenedQuestion } from '../../api/form.api';

expect.extend(matchers);
afterEach(cleanup);

vi.mock('../../api/nin-check.api', () => ({
  checkNinAvailability: vi.fn().mockResolvedValue({ available: true }),
}));

function q(
  name: string,
  label: string,
  overrides: Partial<FlattenedQuestion> = {},
): FlattenedQuestion {
  return {
    id: `q-${name}`,
    type: 'text',
    name,
    label,
    required: false,
    sectionId: 's1',
    sectionTitle: 'Section 1',
    ...overrides,
  };
}

function makeForm(
  questions: FlattenedQuestion[],
  extra: Partial<FlattenedForm> = {},
): FlattenedForm {
  return {
    formId: 'f1',
    title: 'Test form',
    version: '1.0.0',
    questions,
    choiceLists: {},
    sectionShowWhen: {},
    ...extra,
  };
}

describe('FormRenderer required gate (Story 9-54 AC6.3a / AC6.4)', () => {
  it('blocks Continue on an empty required field and shows the required error', async () => {
    const onComplete = vi.fn();
    render(
      <FormRenderer
        formSchema={makeForm([
          q('occupation', 'Occupation', { required: true }),
          q('note', 'Anything else'),
        ])}
        onComplete={onComplete}
      />,
    );

    expect(screen.getByText('Occupation')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('continue-btn'));

    // Stays on the required question; error shown; never advanced / completed.
    await waitFor(() => expect(screen.getByText('This field is required')).toBeInTheDocument());
    expect(screen.getByText('Occupation')).toBeInTheDocument();
    expect(screen.queryByText('Anything else')).not.toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('advances once the required field is filled', async () => {
    render(
      <FormRenderer
        formSchema={makeForm([
          q('occupation', 'Occupation', { required: true }),
          q('note', 'Anything else'),
        ])}
      />,
    );

    await userEvent.type(screen.getByRole('textbox'), 'Tailor');
    await userEvent.click(screen.getByTestId('continue-btn'));

    await waitFor(() => expect(screen.getByText('Anything else')).toBeInTheDocument());
  });
});

describe('FormRenderer computed-field skip-logic (Story 9-54 AC1 render)', () => {
  it('shows a question gated on ${age} >= 15 when the computed age qualifies', () => {
    render(
      <FormRenderer
        formSchema={makeForm(
          [
            q('employment_status', 'Employment status', {
              showWhen: { field: 'age', operator: 'greater_or_equal', value: 15 },
            }),
          ],
          {
            calculations: [{ name: 'age', expression: 'int((today() - ${dob}) div 365.25)' }],
          },
        )}
        initialResponses={{ dob: '1980-01-01' }} // ~45 → age gate passes
        hideNavigation
      />,
    );
    expect(screen.getByText('Employment status')).toBeInTheDocument();
  });

  it('hides a question gated on ${age} >= 15 for a respondent under the floor', () => {
    render(
      <FormRenderer
        formSchema={makeForm(
          [
            q('employment_status', 'Employment status', {
              showWhen: { field: 'age', operator: 'greater_or_equal', value: 15 },
            }),
          ],
          {
            calculations: [{ name: 'age', expression: 'int((today() - ${dob}) div 365.25)' }],
          },
        )}
        initialResponses={{ dob: '2020-01-01' }} // ~5 → age gate fails
        hideNavigation
      />,
    );
    // Only question is gated off → empty state, never painted.
    expect(screen.getByTestId('form-renderer-empty')).toBeInTheDocument();
    expect(screen.queryByText('Employment status')).not.toBeInTheDocument();
  });
});
