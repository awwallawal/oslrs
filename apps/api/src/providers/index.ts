import type { EmailProvider, EmailConfig, EmailProviderType } from '@oslsr/types';
import { ResendEmailProvider } from './resend.provider.js';
import { MockEmailProvider } from './mock-email.provider.js';

// Re-export providers for direct imports if needed
export { ResendEmailProvider } from './resend.provider.js';
export { MockEmailProvider } from './mock-email.provider.js';

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
function resolveProviderType(configuredProvider: EmailProviderType): EmailProviderType {
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
    fromAddress: process.env.EMAIL_FROM_ADDRESS || 'noreply@oyotradeministry.com.ng',
    fromName: process.env.EMAIL_FROM_NAME || 'Oyo State Labour Registry',
    tier: (process.env.EMAIL_TIER as EmailConfig['tier']) || 'free',
    resendApiKey: process.env.RESEND_API_KEY,
    monthlyOverageBudgetCents: parseInt(process.env.EMAIL_MONTHLY_OVERAGE_BUDGET || '3000', 10),
    resendMaxPerUser: parseInt(process.env.EMAIL_RESEND_MAX_PER_USER || '3', 10),
  };
}
