import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

expect.extend(matchers);

import { GeopointInput } from '../GeopointInput';
import type { FlattenedQuestion } from '../../api/form.api';

afterEach(() => {
  cleanup();
});

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

    // Story 13-75 AC5 — the old copy ("Location access denied. GPS data will not
    // be recorded.") assumed the site was the problem. iOS Safari reports code 1
    // when Location Services is off system-wide, so BOTH gates are named.
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/blocked for this site/);
    expect(alert).toHaveTextContent(/Location Services/);
  });

  it('13-75 AC7 — explains the page’s recorded failure while there is no position', () => {
    render(
      <GeopointInput
        question={baseQuestion}
        value={null}
        onChange={vi.fn()}
        captureFailureReason="position_unavailable"
      />
    );
    expect(screen.getByTestId('geopoint-remediation-location')).toHaveTextContent(
      /location may be switched off/,
    );
  });

  it('13-75 AC7 — and says nothing once a position is held', () => {
    render(
      <GeopointInput
        question={baseQuestion}
        value={{ latitude: 9.0, longitude: 5.0, accuracy: 10 }}
        onChange={vi.fn()}
        captureFailureReason="timeout"
      />
    );
    expect(screen.queryByTestId('geopoint-remediation-location')).toBeNull();
  });

  /*
   * ⚠️ REWRITTEN BY THE 13-75 REVIEW (L5). This asserted that the component's own
   * failure outranks a page reason that stayed FIXED at an older value. In the page
   * that cannot happen — `onCaptureError` updates the page with this very failure —
   * and the precedence it pinned is what let a geopoint-LAST form show an old
   * failure on the question beside a newer one in the block. The freshest verdict
   * is the page's whenever a page is tracking one.
   */
  it('13-75 — with no page tracking a reason, its OWN failure is shown', () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: vi.fn((_success, error) => error({ code: 3 })),
      },
    });
    render(<GeopointInput question={baseQuestion} value={null} onChange={vi.fn()} />);
    fireEvent.click(screen.getByTestId('geopoint-capture-location'));
    expect(screen.getByTestId('geopoint-remediation-location')).toHaveTextContent(/Step outside/);
  });

  it('13-75 review L5 — when the page tracks a reason, the page’s (newer) verdict wins over an older local one', () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: vi.fn((_success, error) => error({ code: 3 })),
      },
    });
    const { rerender } = render(
      <GeopointInput question={baseQuestion} value={null} onChange={vi.fn()} captureFailureReason="timeout" />
    );
    fireEvent.click(screen.getByTestId('geopoint-capture-location')); // local: timeout
    // A later attempt elsewhere on the page (the in-banner button) was refused.
    rerender(
      <GeopointInput question={baseQuestion} value={null} onChange={vi.fn()} captureFailureReason="permission_denied" />
    );
    expect(screen.getByTestId('geopoint-remediation-location')).toHaveTextContent(/blocked for this site/);
  });

  it('13-75 review L5 — a failed RECAPTURE is still reported over a held position', () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: vi.fn((_success, error) => error({ code: 3 })),
      },
    });
    render(
      <GeopointInput
        question={baseQuestion}
        value={{ latitude: 9.0, longitude: 5.0, accuracy: 10 }}
        onChange={vi.fn()}
        captureFailureReason="timeout"
      />
    );
    fireEvent.click(screen.getByText('Recapture'));
    expect(screen.getByTestId('geopoint-remediation-location')).toHaveTextContent(/Step outside/);
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
