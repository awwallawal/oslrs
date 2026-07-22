// @vitest-environment jsdom

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormRenderer } from '../FormRenderer';
import type { FlattenedForm, FlattenedQuestion } from '../../api/form.api';

expect.extend(matchers);
afterEach(cleanup);

// useNinCheck only hits the network inside a debounced timer triggered on NIN
// blur; these tests never type into a NIN field, but mock the API for safety.
vi.mock('../../api/nin-check.api', () => ({
  checkNinAvailability: vi.fn().mockResolvedValue({ available: true }),
}));

function q(
  name: string,
  label: string,
  type: FlattenedQuestion['type'] = 'text',
  opts: { required?: boolean; sectionId?: string } = {},
): FlattenedQuestion {
  const sectionId = opts.sectionId ?? 's1';
  return {
    id: `q-${name}`,
    type,
    name,
    label,
    required: opts.required ?? false,
    sectionId,
    sectionTitle: `Section ${sectionId}`,
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

/** The GPS permission-prompt control (GeopointInput), keyed off the question name. */
const gpsCapture = (name = 'gps') => screen.queryByTestId(`geopoint-capture-${name}`);

/**
 * Story 13-34 AC2 — defensive guard: in the public respondent context
 * (`suppressGeopoint`), a geopoint question is never rendered even if a future
 * form re-introduces one. The clerk/enumerator/form-filler contexts omit the
 * prop, so field GPS still renders.
 */
describe('FormRenderer suppressGeopoint (Story 13-34 AC2)', () => {
  it('never renders a geopoint question when suppressGeopoint is set (snaps past it)', () => {
    render(
      <FormRenderer
        formSchema={makeForm([
          q('main_occupation', 'Main Occupation'),
          q('gps', 'Capture GPS', 'geopoint'),
          q('skills', 'Skills'),
        ])}
        suppressGeopoint
        hideNavigation
      />,
    );
    // First question (occupation) shows; geopoint is scoped out of the flow.
    expect(screen.getByText('Main Occupation')).toBeInTheDocument();
    expect(screen.queryByText('Capture GPS')).not.toBeInTheDocument();
    // No GPS permission-prompt control anywhere in the rendered flow.
    expect(gpsCapture()).not.toBeInTheDocument();
  });

  it('scopes the geopoint OUT of the visible progress count when suppressed', () => {
    render(
      <FormRenderer
        formSchema={makeForm([
          q('a', 'A'),
          q('gps', 'Capture GPS', 'geopoint'),
          q('b', 'B'),
        ])}
        suppressGeopoint
        hideNavigation
      />,
    );
    // 3 questions, 1 geopoint suppressed → 2 visible.
    expect(screen.getByTestId('progress-bar').textContent).toContain('of 2');
  });

  it('renders the empty state (not the geopoint) when the ONLY question is geopoint', () => {
    render(
      <FormRenderer
        formSchema={makeForm([q('gps', 'Capture GPS', 'geopoint')])}
        suppressGeopoint
        hideNavigation
      />,
    );
    expect(screen.getByTestId('form-renderer-empty')).toBeInTheDocument();
    expect(screen.queryByText('Capture GPS')).not.toBeInTheDocument();
    expect(gpsCapture()).not.toBeInTheDocument();
  });

  it('DOES render a geopoint question when suppressGeopoint is omitted (clerk/enumerator back-compat)', () => {
    render(
      <FormRenderer
        formSchema={makeForm([q('gps', 'Capture GPS', 'geopoint'), q('b', 'B')])}
        hideNavigation
      />,
    );
    // Field-GPS contexts still render the geopoint capture control.
    expect(screen.getByText('Capture GPS')).toBeInTheDocument();
    expect(gpsCapture()).toBeInTheDocument();
  });

  it('unions geopoint suppression with hideQuestionNames', () => {
    render(
      <FormRenderer
        formSchema={makeForm([
          q('full_name', 'Full name'),
          q('gps', 'Capture GPS', 'geopoint'),
          q('skills', 'Skills'),
        ])}
        suppressGeopoint
        hideQuestionNames={new Set(['full_name'])}
        hideNavigation
      />,
    );
    // full_name hidden (prefilled) + gps suppressed → lands on Skills.
    expect(screen.getByText('Skills')).toBeInTheDocument();
    expect(screen.queryByText('Full name')).not.toBeInTheDocument();
    expect(gpsCapture()).not.toBeInTheDocument();
  });

  // AI-Review M3 — the ACTUAL public wizard mount always passes `sectionIndex`
  // (section-at-a-time). Pin the union of BOTH branches of buildEffectiveHidden,
  // which no other test exercised.
  it('unions geopoint suppression with sectionIndex scoping (the real wizard mount shape)', () => {
    render(
      <FormRenderer
        formSchema={makeForm([
          q('a', 'A', 'text', { sectionId: 's1' }),
          q('gps', 'Capture GPS', 'geopoint', { sectionId: 's2' }),
          q('b', 'B', 'text', { sectionId: 's2' }),
        ])}
        suppressGeopoint
        sectionIndex={1}
        hideNavigation
      />,
    );
    // Section 2 only, minus the geopoint → B alone, and it is the only step.
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.queryByText('A')).not.toBeInTheDocument();
    expect(gpsCapture()).not.toBeInTheDocument();
    expect(screen.getByTestId('progress-bar').textContent).toContain('of 1');
  });

  // AI-Review M3 — a section left with ONLY a suppressed geopoint must fall to
  // the empty state (this is what makes WizardPage's auto-skip load-bearing).
  it('renders the empty state for a section whose only question is a suppressed geopoint', () => {
    render(
      <FormRenderer
        formSchema={makeForm([
          q('a', 'A', 'text', { sectionId: 's1' }),
          q('gps', 'Capture GPS', 'geopoint', { sectionId: 's2' }),
        ])}
        suppressGeopoint
        sectionIndex={1}
        hideNavigation
      />,
    );
    expect(screen.getByTestId('form-renderer-empty')).toBeInTheDocument();
    expect(gpsCapture()).not.toBeInTheDocument();
  });

  // AI-Review M2 — the prop's documented contract says a suppressed geopoint is
  // never client-validated and never gates Continue. Prove it with `required`.
  it('a REQUIRED suppressed geopoint never gates Continue (no validation dead-end)', async () => {
    const onComplete = vi.fn();
    render(
      <FormRenderer
        formSchema={makeForm([
          q('a', 'A'),
          q('gps', 'Capture GPS', 'geopoint', { required: true }),
          q('b', 'B'),
        ])}
        suppressGeopoint
        onComplete={onComplete}
      />,
    );

    await userEvent.click(screen.getByTestId('continue-btn'));
    // Advances straight from A to B — the required geopoint is neither rendered
    // nor validated (pre-fix it would have been unreachable-but-required).
    await waitFor(() => expect(screen.getByText('B')).toBeInTheDocument());
    expect(gpsCapture()).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId('continue-btn'));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });
});
