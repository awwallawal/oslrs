import pino from 'pino';

const logger = pino({ name: 'sms-service' });

// ============================================================================
// SMS Provider Interface (Strategy Pattern — follows EmailService pattern)
// ============================================================================

export interface SMSResult {
  success: boolean;
  error?: string;
  messageId?: string;
}

export interface SMSProvider {
  readonly name: string;
  send(to: string, message: string): Promise<SMSResult>;
}

// ============================================================================
// Mock SMS Provider (dev/test — logs to console, stores in memory)
// ============================================================================

export class MockSMSProvider implements SMSProvider {
  readonly name = 'mock';
  public sentMessages: Array<{ to: string; message: string; timestamp: Date }> = [];

  async send(to: string, message: string): Promise<SMSResult> {
    this.sentMessages.push({ to, message, timestamp: new Date() });
    logger.info({ event: 'sms.mock_sent', to, messagePreview: message.substring(0, 80) });
    return { success: true, messageId: `mock-${Date.now()}` };
  }

  clear(): void {
    this.sentMessages = [];
  }
}

// ============================================================================
// HTTP SMS Provider (generic — configurable for any SMS API vendor)
// ============================================================================

export class HttpSMSProvider implements SMSProvider {
  readonly name = 'http';
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly senderId: string;

  constructor(config: { apiUrl: string; apiKey: string; senderId: string }) {
    this.apiUrl = config.apiUrl;
    this.apiKey = config.apiKey;
    this.senderId = config.senderId;
  }

  async send(to: string, message: string): Promise<SMSResult> {
    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          to,
          from: this.senderId,
          sms: message,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        logger.error({ event: 'sms.http_send_failed', to, status: response.status, body });
        return { success: false, error: `HTTP ${response.status}: ${body}` };
      }

      const data = (await response.json()) as Record<string, unknown>;
      logger.info({ event: 'sms.http_sent', to, messageId: data.message_id || data.messageId });
      return {
        success: true,
        messageId: String(data.message_id || data.messageId || `http-${Date.now()}`),
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error({ event: 'sms.http_send_error', to, error: errorMsg });
      return { success: false, error: errorMsg };
    }
  }
}

// ============================================================================
// SMS Service (static class — matches EmailService pattern)
// ============================================================================

let mockProviderInstance: MockSMSProvider | null = null;

export function getMockSMSProvider(): MockSMSProvider {
  if (!mockProviderInstance) {
    mockProviderInstance = new MockSMSProvider();
  }
  return mockProviderInstance;
}

export function resetMockSMSProvider(): void {
  if (mockProviderInstance) {
    mockProviderInstance.clear();
  }
  mockProviderInstance = null;
}

export class SMSService {
  private static provider: SMSProvider | null = null;

  static initialize(): void {
    this.provider = this.createProvider();
    logger.info({
      event: 'sms.service.initialized',
      provider: this.provider.name,
      enabled: this.isEnabled(),
    });
  }

  private static createProvider(): SMSProvider {
    const providerType = process.env.SMS_PROVIDER || 'mock';

    // Always use mock in test mode
    if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
      return getMockSMSProvider();
    }

    if (providerType === 'http') {
      const apiUrl = process.env.SMS_API_URL;
      const apiKey = process.env.SMS_API_KEY;
      if (!apiUrl || !apiKey) {
        logger.warn({
          event: 'sms.http_provider_missing_config',
          note: 'SMS_API_URL and SMS_API_KEY required for http provider. Falling back to mock.',
        });
        return getMockSMSProvider();
      }
      return new HttpSMSProvider({
        apiUrl,
        apiKey,
        senderId: process.env.SMS_SENDER_ID || 'OSLRS',
      });
    }

    return getMockSMSProvider();
  }

  private static getProvider(): SMSProvider {
    if (!this.provider) {
      this.initialize();
    }
    return this.provider!;
  }

  static isEnabled(): boolean {
    const providerType = process.env.SMS_PROVIDER || 'mock';
    return providerType !== 'disabled';
  }

  static async send(to: string, message: string): Promise<SMSResult> {
    if (!this.isEnabled()) {
      logger.warn({ event: 'sms.disabled', to });
      return { success: false, error: 'SMS service is disabled' };
    }

    return this.getProvider().send(to, message);
  }
}
