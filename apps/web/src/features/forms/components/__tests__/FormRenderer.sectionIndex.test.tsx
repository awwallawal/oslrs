// @vitest-environment jsdom

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { FormRenderer } from '../FormRenderer';
import type { FlattenedForm, FlattenedQuestion } from '../../api/form.api';
import type { Condition } from '@oslsr/types';

expect.extend(matchers);
afterEach(cleanup);

vi.mock('../../api/nin-check.api', () => ({
  checkNinAvailability: vi.fn().mockResolvedValue({ available: true }),
}));

function q(
  name: string,
  label: string,
  sectionId: string,
  sectionTitle: string,
  showWhen?: Condition,
): FlattenedQuestion {
  return { id: `id-${name}`, type: 'text', name, label, required: false, sectionId, sectionTitle, showWhen };
}

// Two sections; B2 is conditional on A1 (cross-section showWhen).
function twoSectionForm(): FlattenedForm {
  return {
    formId: 'f1',
    title: 'Two-section form',
    version: '1.0.0',
    questions: [
      q('a1', 'A1', 's1', 'Section A'),
      q('a2', 'A2', 's1', 'Section A'),
      q('b1', 'B1', 's2', 'Section B'),
      q('b2', 'B2', 's2', 'Section B', { field: 'a1', operator: 'equals', value: 'yes' }),
    ],
    choiceLists: {},
    sectionShowWhen: {},
  };
}

describe('FormRenderer sectionIndex (Story 9-18 Part E AC#E2)', () => {
  it('renders only the first section when sectionIndex=0', () => {
    render(<FormRenderer formSchema={twoSectionForm()} sectionIndex={0} hideNavigation />);
    expect(screen.getByText('A1')).toBeInTheDocument();
    expect(screen.queryByText('B1')).not.toBeInTheDocument();
  });

  it('renders only the second section when sectionIndex=1', () => {
    render(
      <FormRenderer
        formSchema={twoSectionForm()}
        sectionIndex={1}
        initialResponses={{ a1: 'no' }}
        hideNavigation
      />,
    );
    expect(screen.getByText('B1')).toBeInTheDocument();
    expect(screen.queryByText('A1')).not.toBeInTheDocument();
  });

  it('honours cross-section showWhen (E4): B2 visible only when A1=yes', () => {
    render(
      <FormRenderer
        formSchema={twoSectionForm()}
        sectionIndex={1}
        initialResponses={{ a1: 'yes' }}
        hideNavigation
      />,
    );
    // Section B now has 2 visible questions (B1 + the revealed B2).
    expect(screen.getByTestId('progress-bar').textContent).toContain('of 2');
  });

  it('hides B2 when its cross-section dependency is unmet', () => {
    render(
      <FormRenderer
        formSchema={twoSectionForm()}
        sectionIndex={1}
        initialResponses={{ a1: 'no' }}
        hideNavigation
      />,
    );
    // Only B1 visible (B2 gated off).
    expect(screen.getByTestId('progress-bar').textContent).toContain('of 1');
  });

  it('unions sectionIndex scoping with hideQuestionNames', () => {
    render(
      <FormRenderer
        formSchema={twoSectionForm()}
        sectionIndex={0}
        hideQuestionNames={new Set(['a1'])}
        hideNavigation
      />,
    );
    // a1 hidden (prefilled) → first visible in section A is A2.
    expect(screen.getByText('A2')).toBeInTheDocument();
    expect(screen.queryByText('A1')).not.toBeInTheDocument();
  });

  it('renders all sections when sectionIndex is omitted (back-compat)', () => {
    render(<FormRenderer formSchema={twoSectionForm()} hideNavigation />);
    expect(screen.getByText('A1')).toBeInTheDocument();
  });
});
