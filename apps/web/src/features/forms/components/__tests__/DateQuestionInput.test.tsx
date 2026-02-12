import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

expect.extend(matchers);

import { DateQuestionInput } from '../DateQuestionInput';
import type { FlattenedQuestion } from '../../api/form.api';

const baseQuestion: FlattenedQuestion = {
  id: 'q1',
  type: 'date',
  name: 'birth_date',
  label: 'Date of Birth',
  required: true,
  sectionId: 's1',
  sectionTitle: 'Section 1',
};

describe('DateQuestionInput', () => {
  it('renders date input with label', () => {
    render(
      <DateQuestionInput question={baseQuestion} value="" onChange={vi.fn()} />
    );
    expect(screen.getByLabelText(/Date of Birth/)).toBeInTheDocument();
    expect(screen.getByTestId('input-birth_date')).toHaveAttribute('type', 'date');
  });

  it('displays current value', () => {
    render(
      <DateQuestionInput question={baseQuestion} value="2000-01-15" onChange={vi.fn()} />
    );
    expect(screen.getByTestId('input-birth_date')).toHaveValue('2000-01-15');
  });

  it('calls onChange when date is selected', () => {
    const handleChange = vi.fn();
    render(
      <DateQuestionInput question={baseQuestion} value="" onChange={handleChange} />
    );
    fireEvent.change(screen.getByTestId('input-birth_date'), {
      target: { value: '2000-06-15' },
    });
    expect(handleChange).toHaveBeenCalledWith('2000-06-15');
  });

  it('disables input when disabled', () => {
    render(
      <DateQuestionInput question={baseQuestion} value="" onChange={vi.fn()} disabled />
    );
    expect(screen.getByTestId('input-birth_date')).toBeDisabled();
  });

  it('displays error message', () => {
    render(
      <DateQuestionInput
        question={baseQuestion}
        value=""
        onChange={vi.fn()}
        error="Date is required"
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Date is required');
  });

  it('shows validity check when value present and no error', () => {
    render(
      <DateQuestionInput question={baseQuestion} value="2000-01-01" onChange={vi.fn()} />
    );
    expect(screen.getByLabelText('Valid')).toBeInTheDocument();
  });

  it('renders required indicator', () => {
    render(
      <DateQuestionInput question={baseQuestion} value="" onChange={vi.fn()} />
    );
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('renders Yoruba label when provided', () => {
    const questionWithYoruba = { ...baseQuestion, labelYoruba: 'Ojo ibi' };
    render(
      <DateQuestionInput question={questionWithYoruba} value="" onChange={vi.fn()} />
    );
    expect(screen.getByText('Ojo ibi')).toBeInTheDocument();
  });

  it('sets aria-invalid when error exists', () => {
    render(
      <DateQuestionInput
        question={baseQuestion}
        value=""
        onChange={vi.fn()}
        error="Invalid date"
      />
    );
    expect(screen.getByTestId('input-birth_date')).toHaveAttribute('aria-invalid', 'true');
  });
});
