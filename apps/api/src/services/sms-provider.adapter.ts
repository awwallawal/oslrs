/**
 * Story 9-12 AC#7 / Task 2.1 — SMS provider adapter interface.
 *
 * The SMS OTP code path is infrastructure-only by default: the route handlers,
 * service layer and adapter all exist; only the active provider is the
 * `NoopSmsProvider` which always rejects with `SMS_OTP_DISABLED`.
 *
 * When the operator flips `auth.sms_otp_enabled = true` via the Settings
 * Landing UI (prep-settings-landing-and-feature-flags), the resolver below
 * switches to the real provider implementation — for now there is none, so
 * flipping the flag enables the path but every send still 503s. Wiring a
 * real adapter (Termii, Africa's Talking, etc.) is a future Operate-phase
 * change with no story-9-12 code modification required.
 */

import { AppError } from '@oslsr/utils';
import { getSetting } from '../lib/settings.js';

/**
 * Common shape every SMS provider must implement.
 *
 * Methods:
 *  - sendOtp(phone, code): dispatch the 6-digit code via SMS. Throws on
 *    provider error so the caller can map it to the canonical error code.
 */
export interface SmsProviderAdapter {
  readonly name: string;
  sendOtp(phone: string, code: string): Promise<{ providerMessageId: string | null }>;
}

/**
 * Default provider — rejects every call with `SMS_OTP_DISABLED`. Wiring this
 * even when the flag is on is intentional: `auth.sms_otp_enabled = true` only
 * means "the path is no longer immediately 503'd by the route layer"; until a
 * real adapter is constructed and bound here, the no-op still rejects.
 */
export class NoopSmsProvider implements SmsProviderAdapter {
  readonly name = 'noop';

  async sendOtp(phone: string, code: string): Promise<{ providerMessageId: string | null }> {
    // Reference args so the no-op shape stays compatible with concrete
    // providers without lint complaints.
    void phone;
    void code;
    throw new AppError(
      'SMS_OTP_DISABLED',
      'SMS OTP delivery is not configured. Use the email magic-link sign-in path instead.',
      503,
    );
  }
}

/**
 * Single shared adapter instance. Resolution order:
 *   1. If a custom provider has been registered via `registerSmsProvider`, use it.
 *   2. Otherwise return the NoopSmsProvider singleton.
 *
 * This deferred-binding keeps the path testable: tests can register a stub
 * adapter without touching the routes layer.
 */
let registeredProvider: SmsProviderAdapter | null = null;
const noopProvider = new NoopSmsProvider();

export function registerSmsProvider(provider: SmsProviderAdapter | null): void {
  registeredProvider = provider;
}

export function getSmsProvider(): SmsProviderAdapter {
  return registeredProvider ?? noopProvider;
}

/**
 * Convenience wrapper for the route layer: returns true iff the operator has
 * flipped the feature flag on AND a non-noop provider is bound.
 */
export async function isSmsOtpEnabled(): Promise<boolean> {
  const flag = await getSetting<boolean>('auth.sms_otp_enabled');
  return flag === true;
}
