import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

expect.extend(matchers);

import { SelectMultipleInput } from '../SelectMultipleInput';
import type { FlattenedQuestion } from '../../api/form.api';

const baseQuestion: FlattenedQuestion = {
  id: 'q1',
  type: 'select_multiple',
  name: 'skills',
  label: 'What skills do you have?',
  required: true,
  sectionId: 's1',
  sectionTitle: 'Section 1',
  choices: [
    { label: 'Reading', value: 'reading' },
    { label: 'Writing', value: 'writing' },
    { label: 'Arithmetic', value: 'arithmetic' },
  ],
};

describe('SelectMultipleInput', () => {
  it('renders all checkbox options', () => {
    render(
      <SelectMultipleInput question={baseQuestion} value={[]} onChange={vi.fn()} />
    );
    expect(screen.getByTestId('checkbox-skills-reading')).toBeInTheDocument();
    expect(screen.getByTestId('checkbox-skills-writing')).toBeInTheDocument();
    expect(screen.getByTestId('checkbox-skills-arithmetic')).toBeInTheDocument();
  });

  it('shows selected values as checked', () => {
    render(
      <SelectMultipleInput question={baseQuestion} value={['reading', 'arithmetic']} onChange={vi.fn()} />
    );
    expect(screen.getByTestId('checkbox-skills-reading')).toBeChecked();
    expect(screen.getByTestId('checkbox-skills-writing')).not.toBeChecked();
    expect(screen.getByTestId('checkbox-skills-arithmetic')).toBeChecked();
  });

  it('calls onChange to add a choice', () => {
    const handleChange = vi.fn();
    render(
      <SelectMultipleInput question={baseQuestion} value={['reading']} onChange={handleChange} />
    );
    fireEvent.click(screen.getByTestId('checkbox-skills-writing'));
    expect(handleChange).toHaveBeenCalledWith(['reading', 'writing']);
  });

  it('calls onChange to remove a choice', () => {
    const handleChange = vi.fn();
    render(
      <SelectMultipleInput question={baseQuestion} value={['reading', 'writing']} onChange={handleChange} />
    );
    fireEvent.click(screen.getByTestId('checkbox-skills-reading'));
    expect(handleChange).toHaveBeenCalledWith(['writing']);
  });

  it('disables all checkboxes when disabled', () => {
    render(
      <SelectMultipleInput question={baseQuestion} value={[]} onChange={vi.fn()} disabled />
    );
    expect(screen.getByTestId('checkbox-skills-reading')).toBeDisabled();
    expect(screen.getByTestId('checkbox-skills-writing')).toBeDisabled();
  });

  it('displays error message', () => {
    render(
      <SelectMultipleInput
        question={baseQuestion}
        value={[]}
        onChange={vi.fn()}
        error="Please select at least one"
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Please select at least one');
  });

  it('renders required indicator', () => {
    render(
      <SelectMultipleInput question={baseQuestion} value={[]} onChange={vi.fn()} />
    );
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('renders Yoruba label when provided', () => {
    const questionWithYoruba = { ...baseQuestion, labelYoruba: 'Kini ogbon re?' };
    render(
      <SelectMultipleInput question={questionWithYoruba} value={[]} onChange={vi.fn()} />
    );
    expect(screen.getByText('Kini ogbon re?')).toBeInTheDocument();
  });
});
