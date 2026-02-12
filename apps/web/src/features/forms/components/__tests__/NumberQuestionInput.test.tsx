import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

expect.extend(matchers);

import { NumberQuestionInput } from '../NumberQuestionInput';
import type { FlattenedQuestion } from '../../api/form.api';

const baseQuestion: FlattenedQuestion = {
  id: 'q1',
  type: 'number',
  name: 'age',
  label: 'Age',
  required: false,
  sectionId: 's1',
  sectionTitle: 'Section 1',
};

describe('NumberQuestionInput', () => {
  it('renders label and number input', () => {
    render(
      <NumberQuestionInput question={baseQuestion} value={null} onChange={vi.fn()} />
    );
    expect(screen.getByLabelText('Age')).toBeInTheDocument();
    expect(screen.getByTestId('input-age')).toHaveAttribute('type', 'number');
  });

  it('calls onChange with number value', () => {
    const handleChange = vi.fn();
    render(
      <NumberQuestionInput question={baseQuestion} value={null} onChange={handleChange} />
    );
    fireEvent.change(screen.getByTestId('input-age'), { target: { value: '25' } });
    expect(handleChange).toHaveBeenCalledWith(25);
  });

  it('calls onChange with null for empty input', () => {
    const handleChange = vi.fn();
    render(
      <NumberQuestionInput question={baseQuestion} value={25} onChange={handleChange} />
    );
    fireEvent.change(screen.getByTestId('input-age'), { target: { value: '' } });
    expect(handleChange).toHaveBeenCalledWith(null);
  });

  it('displays error message', () => {
    render(
      <NumberQuestionInput
        question={baseQuestion}
        value={null}
        onChange={vi.fn()}
        error="Must be at least 18"
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Must be at least 18');
  });

  it('disables input when disabled prop is true', () => {
    render(
      <NumberQuestionInput
        question={baseQuestion}
        value={null}
        onChange={vi.fn()}
        disabled
      />
    );
    expect(screen.getByTestId('input-age')).toBeDisabled();
  });
});
