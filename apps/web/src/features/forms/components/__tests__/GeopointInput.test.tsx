import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

expect.extend(matchers);

import { GeopointInput } from '../GeopointInput';
import type { FlattenedQuestion } from '../../api/form.api';

const baseQuestion: FlattenedQuestion = {
  id: 'q1',
  type: 'geopoint',
  name: 'location',
  label: 'Capture Location',
  required: false,
  sectionId: 's1',
  sectionTitle: 'Section 1',
};

describe('GeopointInput', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders capture button when no value', () => {
    render(
      <GeopointInput question={baseQuestion} value={null} onChange={vi.fn()} />
    );
    expect(screen.getByTestId('geopoint-capture-location')).toBeInTheDocument();
  });

  it('displays coordinates when value is set', () => {
    render(
      <GeopointInput
        question={baseQuestion}
        value={{ latitude: 9.0765, longitude: 5.55, accuracy: 15 }}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByTestId('geopoint-display-location')).toBeInTheDocument();
    expect(screen.getByText(/9.0765/)).toBeInTheDocument();
    expect(screen.getByText(/± 15m/)).toBeInTheDocument();
  });

  it('calls onChange with coordinates on successful capture', () => {
    const mockPosition = {
      coords: { latitude: 9.0765, longitude: 5.55, accuracy: 10 },
    };

    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: vi.fn((success) => success(mockPosition)),
      },
    });

    const handleChange = vi.fn();
    render(
      <GeopointInput question={baseQuestion} value={null} onChange={handleChange} />
    );

    fireEvent.click(screen.getByTestId('geopoint-capture-location'));

    expect(handleChange).toHaveBeenCalledWith({
      latitude: 9.0765,
      longitude: 5.55,
      accuracy: 10,
    });
  });

  it('shows error message when permission denied', () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: vi.fn((_success, error) =>
          error({ code: 1, PERMISSION_DENIED: 1 })
        ),
      },
    });

    render(
      <GeopointInput question={baseQuestion} value={null} onChange={vi.fn()} />
    );

    fireEvent.click(screen.getByTestId('geopoint-capture-location'));

    expect(screen.getByRole('alert')).toHaveTextContent(/Location access denied/);
  });

  it('disables capture button when disabled', () => {
    render(
      <GeopointInput question={baseQuestion} value={null} onChange={vi.fn()} disabled />
    );
    expect(screen.getByTestId('geopoint-capture-location')).toBeDisabled();
  });

  it('hides recapture button in disabled mode', () => {
    render(
      <GeopointInput
        question={baseQuestion}
        value={{ latitude: 9.0, longitude: 5.0, accuracy: 10 }}
        onChange={vi.fn()}
        disabled
      />
    );
    expect(screen.queryByText('Recapture')).not.toBeInTheDocument();
  });
});
