/**
 * SettingsLandingPage — super-admin Settings landing.
 *
 * Route: `/dashboard/super-admin/settings`
 *
 * Contents:
 *   1. SMS OTP Toggle       — control card flipping `auth.sms_otp_enabled`
 *   2. Public Wizard Form   — read-only mirror of `wizard.public_form_id` (Story 9-17)
 *   3. Fraud Thresholds →   — link card to existing fraud-thresholds page
 *   4. MFA Settings →       — link card to Story 9-13 MFA management page
 *
 * Reserved space below the cards for future feature flags.
 */
import { MessageCircle, SlidersHorizontal, Shield } from 'lucide-react';
import { Skeleton } from '../../../components/ui/skeleton';
import { SettingCard } from '../components/SettingCard';
import { SmsOtpToggle } from '../components/SmsOtpToggle';
import { PublicWizardFormCard } from '../components/PublicWizardFormCard';
import { useSettings, type SettingRow } from '../api/settings.api';

const SMS_OTP_KEY = 'auth.sms_otp_enabled';
const WIZARD_PIN_KEY = 'wizard.public_form_id';

function findSetting(rows: SettingRow[] | undefined, key: string): SettingRow | undefined {
  return rows?.find((r) => r.key === key);
}

function asBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  return false;
}

export default function SettingsLandingPage() {
  const { data, isLoading, error, refetch } = useSettings();

  return (
    <div className="space-y-6 p-6" data-testid="settings-landing-page">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">System Settings</h1>
        <p className="mt-1 text-sm text-gray-600">
          Toggle feature flags and access configuration tools. All changes are audit-logged.
        </p>
      </header>

      {isLoading && (
        <div className="space-y-4" data-testid="settings-loading">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {error && (
        <div
          className="rounded-lg border border-red-200 bg-red-50 p-4"
          role="alert"
          data-testid="settings-error"
        >
          <p className="text-sm font-medium text-red-800">Failed to load settings</p>
          <p className="mt-1 text-sm text-red-700">{error.message}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-3 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      )}

      {!isLoading && !error && data && (
        <div className="space-y-4">
          {(() => {
            const smsOtp = findSetting(data.settings, SMS_OTP_KEY);
            const initial = asBoolean(smsOtp?.value);
            return (
              <SettingCard
                variant="control"
                icon={MessageCircle}
                title="SMS OTP"
                description="When enabled, public users can authenticate via SMS one-time-passcode. Requires an SMS provider configured."
                control={<SmsOtpToggle initialValue={initial} />}
                audit={
                  smsOtp
                    ? { updatedBy: smsOtp.updatedBy, updatedAt: smsOtp.updatedAt }
                    : undefined
                }
                testId="setting-card-sms-otp"
              />
            );
          })()}

          {(() => {
            const wizardPin = findSetting(data.settings, WIZARD_PIN_KEY);
            const pinnedId = typeof wizardPin?.value === 'string' ? wizardPin.value : null;
            return (
              <PublicWizardFormCard pinnedId={pinnedId} pinnedAt={wizardPin?.updatedAt} />
            );
          })()}

          <SettingCard
            variant="link"
            icon={SlidersHorizontal}
            title="Fraud Thresholds"
            description="Configure fraud detection parameters and thresholds."
            href="/dashboard/super-admin/settings/fraud-thresholds"
            testId="setting-card-fraud-thresholds"
          />

          <SettingCard
            variant="link"
            icon={Shield}
            title="MFA Settings"
            description="Manage TOTP enrollment and backup codes for super-admin accounts."
            href="/dashboard/super-admin/security/mfa"
            testId="setting-card-mfa"
          />

          <p className="pt-4 text-center text-sm text-gray-500" data-testid="settings-footer-note">
            More settings coming soon.
          </p>
        </div>
      )}

      <footer className="border-t border-gray-200 pt-6 text-xs text-gray-500">
        Looking for staff-management settings or fraud-threshold configuration? Use the cards above.
        For ad-hoc settings access, contact a Super Admin.
      </footer>
    </div>
  );
}
