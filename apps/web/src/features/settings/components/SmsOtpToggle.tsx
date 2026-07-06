/**
 * SmsOtpToggle — single boolean toggle for `auth.sms_otp_enabled`.
 *
 * Story 9-12 AC#7 consumer: this is the UI surface that flips the SMS OTP
 * feature flag stored in `system_settings`. Backend reads via
 * `getSetting<boolean>('auth.sms_otp_enabled')` from `apps/api/src/lib/settings.ts`.
 */
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Switch } from '../../../components/ui/switch';
import { useUpdateSetting } from '../api/settings.api';
import { ApiError } from '../../../lib/api-client';

const KEY = 'auth.sms_otp_enabled';

interface Props {
  initialValue: boolean;
}

export function SmsOtpToggle({ initialValue }: Props) {
  const [enabled, setEnabled] = useState(initialValue);
  const updateMutation = useUpdateSetting();

  // Keep local state in sync with refetched data after invalidation.
  useEffect(() => {
    setEnabled(initialValue);
  }, [initialValue]);

  const handleToggle = (next: boolean) => {
    const previous = enabled;
    setEnabled(next); // optimistic
    updateMutation.mutate(
      { key: KEY, value: next },
      {
        onSuccess: () => {
          toast.success(next ? 'SMS OTP enabled' : 'SMS OTP disabled', {
            description: 'Audit-logged.',
          });
        },
        onError: (err) => {
          setEnabled(previous); // rollback
          // Story 13-17: the global interceptor already ran the re-auth flow;
          // this rejection means the user cancelled it — be honest about why.
          if (err instanceof ApiError && err.code === 'AUTH_REAUTH_REQUIRED') {
            toast.error('Re-authentication is required to change this setting', {
              description: 'The SMS OTP setting was not changed.',
            });
            return;
          }
          toast.error('Failed to update SMS OTP setting', {
            description: 'Please try again or check the system status.',
          });
        },
      },
    );
  };

  return (
    <Switch
      checked={enabled}
      onCheckedChange={handleToggle}
      disabled={updateMutation.isPending}
      aria-label="Toggle SMS OTP feature"
      data-testid="sms-otp-toggle"
    />
  );
}
