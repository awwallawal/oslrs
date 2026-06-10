// @vitest-environment jsdom

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { FormRenderer } from '../FormRenderer';
import type { FlattenedForm, FlattenedQuestion } from '../../api/form.api';

expect.extend(matchers);
afterEach(cleanup);

// useNinCheck only hits the network inside a debounced timer triggered on NIN
// blur; these tests never type into a NIN field, but mock the API for safety.
vi.mock('../../api/nin-check.api', () => ({
  checkNinAvailability: vi.fn().mockResolvedValue({ available: true }),
}));

function q(name: string, label: string): FlattenedQuestion {
  return {
    id: `q-${name}`,
    type: 'text',
    name,
    label,
    required: false,
    sectionId: 's1',
    sectionTitle: 'Section 1',
  };
}

function makeForm(questions: FlattenedQuestion[]): FlattenedForm {
  return {
    formId: 'f1',
    title: 'Test form',
    version: '1.0.0',
    questions,
    choiceLists: {},
    sectionShowWhen: {},
  };
}

describe('FormRenderer hideQuestionNames (Story 9-18 AC#B3)', () => {
  it('skips hidden questions and lands on the first visible one', () => {
    render(
      <FormRenderer
        formSchema={makeForm([q('full_name', 'Full name'), q('phone', 'Phone'), q('gender', 'Gender')])}
        hideQuestionNames={new Set(['full_name', 'phone'])}
        hideNavigation
      />,
    );
    // full_name (index 0) is hidden → renderer snaps forward to Gender.
    expect(screen.getByText('Gender')).toBeInTheDocument();
    expect(screen.queryByText('Full name')).not.toBeInTheDocument();
    expect(screen.queryByText('Phone')).not.toBeInTheDocument();
  });

  it('renders every question when hideQuestionNames is omitted (back-compat)', () => {
    render(
      <FormRenderer
        formSchema={makeForm([q('full_name', 'Full name'), q('gender', 'Gender')])}
        hideNavigation
      />,
    );
    // Default behaviour: first question visible, one-at-a-time.
    expect(screen.getByText('Full name')).toBeInTheDocument();
    expect(screen.queryByText('Gender')).not.toBeInTheDocument();
  });

  it('renders the empty state (not a hidden question) when every question is hidden (AI-Review M3)', () => {
    render(
      <FormRenderer
        formSchema={makeForm([q('full_name', 'Full name'), q('phone', 'Phone')])}
        hideQuestionNames={new Set(['full_name', 'phone'])}
        hideNavigation
      />,
    );
    // No visible question remains → empty state, and NEITHER prefilled question paints.
    expect(screen.getByTestId('form-renderer-empty')).toBeInTheDocument();
    expect(screen.queryByText('Full name')).not.toBeInTheDocument();
    expect(screen.queryByText('Phone')).not.toBeInTheDocument();
  });

  it('reflects hidden questions in the visible progress count', () => {
    render(
      <FormRenderer
        formSchema={makeForm([q('a', 'A'), q('b', 'B'), q('c', 'C'), q('d', 'D')])}
        hideQuestionNames={new Set(['a', 'b'])}
        hideNavigation
      />,
    );
    // 4 questions, 2 hidden → 2 visible. ProgressBar renders "Question 1 of 2".
    expect(screen.getByTestId('progress-bar').textContent).toContain('of 2');
  });
});
