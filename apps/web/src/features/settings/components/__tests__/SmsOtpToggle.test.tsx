// @vitest-environment jsdom
/**
 * SmsOtpToggle Tests (Story 13-17 review follow-up M2)
 *
 * The 13-17 class audit softened this surface's generic onError so a
 * reauth-cancelled update gets an honest toast instead of "Failed to update".
 * These tests pin both error branches + the optimistic rollback.
 */
import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { SmsOtpToggle } from '../SmsOtpToggle';
import { ApiError } from '../../../../lib/api-client';

expect.extend(matchers);

afterEach(() => {
  cleanup();
});

const mockUpdateSettingMutate = vi.fn();

vi.mock('../../api/settings.api', () => ({
  useUpdateSetting: () => ({
    mutate: mockUpdateSettingMutate,
    isPending: false,
  }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

type MutateOpts = { onSuccess?: () => void; onError?: (err: unknown) => void };

describe('SmsOtpToggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('successful toggle shows the success toast', async () => {
    mockUpdateSettingMutate.mockImplementation((_payload, opts: MutateOpts) => opts?.onSuccess?.());
    render(<SmsOtpToggle initialValue={false} />);

    await userEvent.click(screen.getByTestId('sms-otp-toggle'));

    expect(mockUpdateSettingMutate).toHaveBeenCalledWith(
      { key: 'auth.sms_otp_enabled', value: true },
      expect.anything(),
    );
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('SMS OTP enabled', { description: 'Audit-logged.' });
    });
  });

  it('reauth-cancelled update shows the honest re-auth toast and rolls back (Story 13-17)', async () => {
    mockUpdateSettingMutate.mockImplementation((_payload, opts: MutateOpts) =>
      opts?.onError?.(
        new ApiError('Re-authentication was not completed, so this action was cancelled.', 403, 'AUTH_REAUTH_REQUIRED'),
      ),
    );
    render(<SmsOtpToggle initialValue={false} />);

    const toggle = screen.getByTestId('sms-otp-toggle');
    await userEvent.click(toggle);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Re-authentication is required to change this setting', {
        description: 'The SMS OTP setting was not changed.',
      });
    });
    // Optimistic flip rolled back to the initial value.
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('a genuine failure keeps the generic error toast and rolls back', async () => {
    mockUpdateSettingMutate.mockImplementation((_payload, opts: MutateOpts) =>
      opts?.onError?.(new ApiError('boom', 500, 'INTERNAL_ERROR')),
    );
    render(<SmsOtpToggle initialValue={true} />);

    const toggle = screen.getByTestId('sms-otp-toggle');
    await userEvent.click(toggle);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to update SMS OTP setting', {
        description: 'Please try again or check the system status.',
      });
    });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });
});
