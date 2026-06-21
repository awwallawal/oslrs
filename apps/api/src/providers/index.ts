import type { EmailProvider, EmailConfig, EmailProviderType } from '@oslsr/types';
import pino from 'pino';
import { sha256Hex } from '@oslsr/utils';
import { ResendEmailProvider } from './resend.provider.js';
import { MockEmailProvider } from './mock-email.provider.js';

// Re-export providers for direct imports if needed
export { ResendEmailProvider } from './resend.provider.js';
export { MockEmailProvider } from './mock-email.provider.js';

const logger = pino({ name: 'email-provider-factory' });

// Story 9-63 AC0 — SHA-256 fingerprint of the known production Resend key (the
// one leaked into local dev on 2026-06-21, draining the shared free-tier quota).
// A one-way hash — safe to commit. Used to HARD-block that specific key from ever
// constructing the real provider in non-prod, even WITH the ALLOW_REAL_EMAIL_IN_DEV
// opt-in. The default-refuse guard below covers every other key. If the prod key
// is rotated (recommended operator action), update this constant — though the
// default-refuse already protects a rotated key copied into a dev .env.
const KNOWN_PROD_RESEND_KEY_SHA256 =
  '113b1ce524807d96aa5789b3472307aabf44b21e74ea7b118551433484490760';

// Story 9-63 AC0 (review M1) — emit the credential-isolation warn only ONCE per
// process. The guard still returns 'mock' every time (isolation always applies);
// resolveProviderType runs once per EmailService/provider construction, so without
// this the warn would repeat per instance instead of AC0's "a single warn".
let credentialIsolationWarned = false;

/**
 * Singleton instance of the mock provider for testing
 * Allows tests to access the same instance to inspect sent emails
 */
let mockProviderInstance: MockEmailProvider | null = null;

/**
 * Get the mock email provider singleton (for testing)
 */
export function getMockEmailProvider(): MockEmailProvider {
  if (!mockProviderInstance) {
    mockProviderInstance = new MockEmailProvider();
  }
  return mockProviderInstance;
}

/**
 * Reset the mock provider singleton (for testing cleanup)
 */
export function resetMockEmailProvider(): void {
  if (mockProviderInstance) {
    mockProviderInstance.clearSentEmails();
  }
  mockProviderInstance = null;
}

/**
 * Factory function to create the appropriate email provider based on configuration
 *
 * Provider selection logic:
 * 1. If EMAIL_PROVIDER=mock OR NODE_ENV !== 'production' → MockEmailProvider
 * 2. If EMAIL_PROVIDER=resend → ResendEmailProvider (requires RESEND_API_KEY)
 *
 * @param config - Email configuration object
 * @returns Configured EmailProvider instance
 * @throws Error if resend provider is requested but API key is missing
 */
export function getEmailProvider(config: EmailConfig): EmailProvider {
  const provider = resolveProviderType(config.provider);

  switch (provider) {
    case 'mock':
      return getMockEmailProvider();

    case 'resend':
      if (!config.resendApiKey) {
        throw new Error(
          'RESEND_API_KEY is required when using Resend provider. ' +
            'Set EMAIL_PROVIDER=mock for development without sending emails.'
        );
      }
      return new ResendEmailProvider({
        apiKey: config.resendApiKey,
        fromAddress: config.fromAddress,
        fromName: config.fromName,
      });

    default:
      throw new Error(`Unknown email provider: ${provider}`);
  }
}

/**
 * Resolve the provider type, applying environment-based defaults
 *
 * - In non-production environments, defaults to mock if not explicitly set to resend
 * - Allows explicit override via EMAIL_PROVIDER env var
 */
export function resolveProviderType(configuredProvider: EmailProviderType): EmailProviderType {
  // Explicit mock request always uses mock
  if (configuredProvider === 'mock') {
    return 'mock';
  }

  // In test environment, always use mock unless explicitly testing resend
  if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
    return 'mock';
  }

  // In development, use mock unless explicitly set to resend
  if (process.env.NODE_ENV !== 'production' && configuredProvider !== 'resend') {
    return 'mock';
  }

  // Story 9-63 AC0 — credential isolation (belt + suspenders). Reaching here in
  // non-prod means EMAIL_PROVIDER=resend was set explicitly (the branch above
  // didn't catch it). Refuse the REAL provider unless an explicit dev opt-in is
  // set, and ALWAYS refuse if the configured key is the known production key
  // (even with the opt-in) — so a copied prod .env can never spend the prod
  // Resend quota or get the prod sender suspended from a dev box (2026-06-21 incident).
  if (process.env.NODE_ENV !== 'production' && configuredProvider === 'resend') {
    // Fingerprint the canonical key source (process.env.RESEND_API_KEY); the
    // EmailConfig.resendApiKey the provider uses is derived from it (review L1).
    const key = (process.env.RESEND_API_KEY ?? '').trim();
    // Committed known-prod fingerprint + any operator-supplied extras (comma-sep
    // SHA-256 hexes) so a newly-leaked key can be blocked without a code change/deploy.
    const blockedFingerprints = [
      KNOWN_PROD_RESEND_KEY_SHA256,
      ...(process.env.RESEND_BLOCKED_KEY_FINGERPRINTS ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ];
    const isKnownProdKey = key.length > 0 && blockedFingerprints.includes(sha256Hex(key));
    const devOptIn =
      process.env.ALLOW_REAL_EMAIL_IN_DEV === '1' || process.env.ALLOW_REAL_EMAIL_IN_DEV === 'true';
    if (isKnownProdKey || !devOptIn) {
      if (!credentialIsolationWarned) {
        credentialIsolationWarned = true;
        logger.warn(
          {
            event: 'email.credential_isolation_enforced',
            reason: isKnownProdKey ? 'known_prod_key_in_nonprod' : 'no_dev_optin',
            nodeEnv: process.env.NODE_ENV,
          },
          isKnownProdKey
            ? '[9-63 AC0] Refusing real Resend in non-prod: configured RESEND_API_KEY matches the production key fingerprint → using mock. Use a throwaway Resend key (separate account) for genuine local delivery tests.'
            : '[9-63 AC0] Refusing real Resend in non-prod (no ALLOW_REAL_EMAIL_IN_DEV opt-in) → using mock.',
        );
      }
      return 'mock';
    }
  }

  return configuredProvider;
}

/**
 * Create email config from environment variables
 *
 * @returns EmailConfig object populated from environment
 */
export function getEmailConfigFromEnv(): EmailConfig {
  return {
    provider: (process.env.EMAIL_PROVIDER as EmailProviderType) || 'mock',
    enabled: process.env.EMAIL_ENABLED !== 'false',
    fromAddress: process.env.EMAIL_FROM_ADDRESS || 'noreply@oyoskills.com',
    fromName: process.env.EMAIL_FROM_NAME || 'Oyo State Labour Registry',
    tier: (process.env.EMAIL_TIER as EmailConfig['tier']) || 'free',
    resendApiKey: process.env.RESEND_API_KEY,
    monthlyOverageBudgetCents: parseInt(process.env.EMAIL_MONTHLY_OVERAGE_BUDGET || '3000', 10),
    resendMaxPerUser: parseInt(process.env.EMAIL_RESEND_MAX_PER_USER || '3', 10),
  };
}
