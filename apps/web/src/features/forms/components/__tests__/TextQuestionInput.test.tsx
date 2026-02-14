import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

expect.extend(matchers);

import { TextQuestionInput } from '../TextQuestionInput';
import type { FlattenedQuestion } from '../../api/form.api';

afterEach(() => {
  cleanup();
});

const baseQuestion: FlattenedQuestion = {
  id: 'q1',
  type: 'text',
  name: 'full_name',
  label: 'Full Name',
  required: true,
  sectionId: 's1',
  sectionTitle: 'Section 1',
};

describe('TextQuestionInput', () => {
  it('renders label and input', () => {
    render(
      <TextQuestionInput question={baseQuestion} value="" onChange={vi.fn()} />
    );
    expect(screen.getByLabelText(/Full Name/)).toBeInTheDocument();
    expect(screen.getByTestId('input-full_name')).toBeInTheDocument();
  });

  it('shows required indicator', () => {
    render(
      <TextQuestionInput question={baseQuestion} value="" onChange={vi.fn()} />
    );
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('calls onChange when value changes', () => {
    const handleChange = vi.fn();
    render(
      <TextQuestionInput question={baseQuestion} value="" onChange={handleChange} />
    );
    fireEvent.change(screen.getByTestId('input-full_name'), {
      target: { value: 'John' },
    });
    expect(handleChange).toHaveBeenCalledWith('John');
  });

  it('displays error message', () => {
    render(
      <TextQuestionInput
        question={baseQuestion}
        value=""
        onChange={vi.fn()}
        error="This field is required"
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent('This field is required');
  });

  it('shows valid checkmark when value is present and no error', () => {
    render(
      <TextQuestionInput question={baseQuestion} value="John" onChange={vi.fn()} />
    );
    expect(screen.getByLabelText('Valid')).toBeInTheDocument();
  });

  it('disables input in preview mode', () => {
    render(
      <TextQuestionInput
        question={baseQuestion}
        value=""
        onChange={vi.fn()}
        disabled
      />
    );
    expect(screen.getByTestId('input-full_name')).toBeDisabled();
  });

  it('shows Yoruba label when provided', () => {
    render(
      <TextQuestionInput
        question={{ ...baseQuestion, labelYoruba: 'Oruko ni kikun' }}
        value=""
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText('Oruko ni kikun')).toBeInTheDocument();
  });
});
