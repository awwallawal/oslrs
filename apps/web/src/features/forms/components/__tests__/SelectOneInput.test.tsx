import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

expect.extend(matchers);

import { SelectOneInput } from '../SelectOneInput';
import type { FlattenedQuestion } from '../../api/form.api';

const baseQuestion: FlattenedQuestion = {
  id: 'q1',
  type: 'select_one',
  name: 'gender',
  label: 'Gender',
  required: true,
  sectionId: 's1',
  sectionTitle: 'Section 1',
  choices: [
    { label: 'Male', value: 'male' },
    { label: 'Female', value: 'female' },
    { label: 'Other', value: 'other' },
  ],
};

describe('SelectOneInput', () => {
  it('renders all radio options', () => {
    render(
      <SelectOneInput question={baseQuestion} value="" onChange={vi.fn()} />
    );
    expect(screen.getByTestId('radio-gender-male')).toBeInTheDocument();
    expect(screen.getByTestId('radio-gender-female')).toBeInTheDocument();
    expect(screen.getByTestId('radio-gender-other')).toBeInTheDocument();
  });

  it('shows selected value as checked', () => {
    render(
      <SelectOneInput question={baseQuestion} value="female" onChange={vi.fn()} />
    );
    expect(screen.getByTestId('radio-gender-female')).toBeChecked();
    expect(screen.getByTestId('radio-gender-male')).not.toBeChecked();
  });

  it('calls onChange when option selected', () => {
    const handleChange = vi.fn();
    render(
      <SelectOneInput question={baseQuestion} value="" onChange={handleChange} />
    );
    fireEvent.click(screen.getByTestId('radio-gender-male'));
    expect(handleChange).toHaveBeenCalledWith('male');
  });

  it('disables all options when disabled', () => {
    render(
      <SelectOneInput question={baseQuestion} value="" onChange={vi.fn()} disabled />
    );
    expect(screen.getByTestId('radio-gender-male')).toBeDisabled();
    expect(screen.getByTestId('radio-gender-female')).toBeDisabled();
  });

  it('displays error message', () => {
    render(
      <SelectOneInput
        question={baseQuestion}
        value=""
        onChange={vi.fn()}
        error="Please select an option"
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Please select an option');
  });
});
