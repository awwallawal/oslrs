import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

expect.extend(matchers);

import { QuestionRenderer } from '../QuestionRenderer';
import type { FlattenedQuestion } from '../../api/form.api';

afterEach(() => {
  cleanup();
});

function makeQuestion(overrides: Partial<FlattenedQuestion> = {}): FlattenedQuestion {
  return {
    id: 'q1',
    type: 'text',
    name: 'test_field',
    label: 'Test Question',
    required: false,
    sectionId: 's1',
    sectionTitle: 'Section 1',
    ...overrides,
  };
}

describe('QuestionRenderer', () => {
  it('renders TextQuestionInput for text type', () => {
    render(
      <QuestionRenderer
        question={makeQuestion({ type: 'text' })}
        value=""
        onChange={vi.fn()}
      />
    );
    expect(screen.getByTestId('input-test_field')).toHaveAttribute('type', 'text');
  });

  it('renders NumberQuestionInput for number type', () => {
    render(
      <QuestionRenderer
        question={makeQuestion({ type: 'number' })}
        value={null}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByTestId('input-test_field')).toHaveAttribute('type', 'number');
  });

  it('renders DateQuestionInput for date type', () => {
    render(
      <QuestionRenderer
        question={makeQuestion({ type: 'date' })}
        value=""
        onChange={vi.fn()}
      />
    );
    expect(screen.getByTestId('input-test_field')).toHaveAttribute('type', 'date');
  });

  it('renders SelectOneInput for select_one type', () => {
    render(
      <QuestionRenderer
        question={makeQuestion({
          type: 'select_one',
          choices: [{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }],
        })}
        value=""
        onChange={vi.fn()}
      />
    );
    expect(screen.getByTestId('radio-test_field-yes')).toBeInTheDocument();
    expect(screen.getByTestId('radio-test_field-no')).toBeInTheDocument();
  });

  it('renders SelectMultipleInput for select_multiple type', () => {
    render(
      <QuestionRenderer
        question={makeQuestion({
          type: 'select_multiple',
          choices: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }],
        })}
        value={[]}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByTestId('checkbox-test_field-a')).toBeInTheDocument();
    expect(screen.getByTestId('checkbox-test_field-b')).toBeInTheDocument();
  });

  it('renders GeopointInput for geopoint type', () => {
    render(
      <QuestionRenderer
        question={makeQuestion({ type: 'geopoint' })}
        value={null}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByTestId('geopoint-capture-test_field')).toBeInTheDocument();
  });

  it('renders NoteDisplay for note type', () => {
    render(
      <QuestionRenderer
        question={makeQuestion({ type: 'note', label: 'Important note' })}
        value={null}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByTestId('note-test_field')).toBeInTheDocument();
    expect(screen.getByText('Important note')).toBeInTheDocument();
  });

  it('renders unsupported type message for unknown type', () => {
    render(
      <QuestionRenderer
        question={makeQuestion({ type: 'unknown' as never })}
        value={null}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByTestId('unsupported-type')).toBeInTheDocument();
  });
});
