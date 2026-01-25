import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { EmailConfig, EmailContent } from '@oslsr/types';
import { MockEmailProvider } from '../mock-email.provider.js';
import {
  getEmailProvider,
  getEmailConfigFromEnv,
  getMockEmailProvider,
  resetMockEmailProvider,
} from '../index.js';

describe('Email Providers', () => {
  const testEmail: EmailContent = {
    to: 'test@example.com',
    subject: 'Test Subject',
    html: '<p>Test HTML content</p>',
    text: 'Test plain text content',
  };

  describe('MockEmailProvider', () => {
    let provider: MockEmailProvider;

    beforeEach(() => {
      provider = new MockEmailProvider();
    });

    it('should have correct provider name', () => {
      expect(provider.name).toBe('mock');
    });

    it('should successfully "send" an email', async () => {
      const result = await provider.send(testEmail);

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
      expect(result.messageId).toMatch(/^mock-/);
    });

    it('should store sent emails', async () => {
      await provider.send(testEmail);

      const sentEmails = provider.getSentEmails();
      expect(sentEmails).toHaveLength(1);
      expect(sentEmails[0]).toEqual(testEmail);
    });

    it('should return last sent email', async () => {
      const email1: EmailContent = { ...testEmail, to: 'first@example.com' };
      const email2: EmailContent = { ...testEmail, to: 'second@example.com' };

      await provider.send(email1);
      await provider.send(email2);

      const lastEmail = provider.getLastEmail();
      expect(lastEmail?.to).toBe('second@example.com');
    });

    it('should clear sent emails', async () => {
      await provider.send(testEmail);
      expect(provider.getSentEmails()).toHaveLength(1);

      provider.clearSentEmails();
      expect(provider.getSentEmails()).toHaveLength(0);
    });

    it('should find emails by recipient', async () => {
      await provider.send({ ...testEmail, to: 'user1@example.com' });
      await provider.send({ ...testEmail, to: 'user2@example.com' });
      await provider.send({ ...testEmail, to: 'user1@example.com' });

      const emails = provider.findEmailsTo('user1@example.com');
      expect(emails).toHaveLength(2);
    });

    it('should check if email was sent to address', async () => {
      await provider.send(testEmail);

      expect(provider.wasSentTo('test@example.com')).toBe(true);
      expect(provider.wasSentTo('other@example.com')).toBe(false);
    });
  });

  describe('ResendEmailProvider', () => {
    // Import dynamically to avoid issues with mocking
    let ResendEmailProvider: typeof import('../resend.provider.js').ResendEmailProvider;

    beforeEach(async () => {
      // Re-import to get fresh module
      const module = await import('../resend.provider.js');
      ResendEmailProvider = module.ResendEmailProvider;
    });

    it('should have correct provider name', () => {
      const provider = new ResendEmailProvider({
        apiKey: 're_test_key',
        fromAddress: 'test@example.com',
        fromName: 'Test Sender',
      });

      expect(provider.name).toBe('resend');
    });

    it('should throw error if API key is missing', () => {
      expect(() => {
        new ResendEmailProvider({
          apiKey: '',
          fromAddress: 'test@example.com',
          fromName: 'Test Sender',
        });
      }).toThrow('Resend API key is required');
    });

    it('should throw error if from address is missing', () => {
      expect(() => {
        new ResendEmailProvider({
          apiKey: 're_test_key',
          fromAddress: '',
          fromName: 'Test Sender',
        });
      }).toThrow('From email address is required');
    });

    // Note: Integration tests with actual Resend SDK would require
    // a test API key and should be run separately. The provider
    // pattern allows us to test the rest of the application with MockEmailProvider.
  });

  describe('getEmailProvider factory', () => {
    beforeEach(() => {
      resetMockEmailProvider();
    });

    it('should return MockEmailProvider when provider is "mock"', () => {
      const config: EmailConfig = {
        provider: 'mock',
        enabled: true,
        fromAddress: 'test@example.com',
        fromName: 'Test',
        tier: 'free',
        monthlyOverageBudgetCents: 3000,
        resendMaxPerUser: 3,
      };

      const provider = getEmailProvider(config);
      expect(provider.name).toBe('mock');
    });

    it('should return MockEmailProvider in test environment', () => {
      const config: EmailConfig = {
        provider: 'resend',
        enabled: true,
        fromAddress: 'test@example.com',
        fromName: 'Test',
        tier: 'free',
        resendApiKey: 're_test_key',
        monthlyOverageBudgetCents: 3000,
        resendMaxPerUser: 3,
      };

      // VITEST env var is set during tests
      const provider = getEmailProvider(config);
      expect(provider.name).toBe('mock');
    });

    it('should throw error if resend provider requested without API key', () => {
      // Temporarily override environment
      const originalEnv = process.env.NODE_ENV;
      const originalVitest = process.env.VITEST;
      process.env.NODE_ENV = 'production';
      delete process.env.VITEST;

      try {
        const config: EmailConfig = {
          provider: 'resend',
          enabled: true,
          fromAddress: 'test@example.com',
          fromName: 'Test',
          tier: 'free',
          monthlyOverageBudgetCents: 3000,
          resendMaxPerUser: 3,
          // No resendApiKey
        };

        expect(() => getEmailProvider(config)).toThrow('RESEND_API_KEY is required');
      } finally {
        process.env.NODE_ENV = originalEnv;
        if (originalVitest) process.env.VITEST = originalVitest;
      }
    });

    it('should return same mock provider instance (singleton)', () => {
      const config: EmailConfig = {
        provider: 'mock',
        enabled: true,
        fromAddress: 'test@example.com',
        fromName: 'Test',
        tier: 'free',
        monthlyOverageBudgetCents: 3000,
        resendMaxPerUser: 3,
      };

      const provider1 = getEmailProvider(config);
      const provider2 = getEmailProvider(config);

      expect(provider1).toBe(provider2);
    });
  });

  describe('getMockEmailProvider', () => {
    beforeEach(() => {
      resetMockEmailProvider();
    });

    it('should return singleton instance', () => {
      const provider1 = getMockEmailProvider();
      const provider2 = getMockEmailProvider();

      expect(provider1).toBe(provider2);
    });

    it('should preserve sent emails across calls', async () => {
      const provider1 = getMockEmailProvider();
      await provider1.send(testEmail);

      const provider2 = getMockEmailProvider();
      expect(provider2.getSentEmails()).toHaveLength(1);
    });
  });

  describe('resetMockEmailProvider', () => {
    beforeEach(() => {
      resetMockEmailProvider();
    });

    it('should clear the singleton instance', async () => {
      const provider1 = getMockEmailProvider();
      await provider1.send(testEmail);
      expect(provider1.getSentEmails()).toHaveLength(1);

      resetMockEmailProvider();

      const provider2 = getMockEmailProvider();
      expect(provider2.getSentEmails()).toHaveLength(0);
      expect(provider2).not.toBe(provider1);
    });
  });

  describe('getEmailConfigFromEnv', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
      // Clear relevant env vars
      delete process.env.EMAIL_PROVIDER;
      delete process.env.EMAIL_ENABLED;
      delete process.env.EMAIL_FROM_ADDRESS;
      delete process.env.EMAIL_FROM_NAME;
      delete process.env.EMAIL_TIER;
      delete process.env.RESEND_API_KEY;
      delete process.env.EMAIL_MONTHLY_OVERAGE_BUDGET;
      delete process.env.EMAIL_RESEND_MAX_PER_USER;
    });

    afterEach(() => {
      // Restore original env
      Object.assign(process.env, originalEnv);
    });

    it('should return default config when env vars not set', () => {
      const config = getEmailConfigFromEnv();

      expect(config.provider).toBe('mock');
      expect(config.enabled).toBe(true);
      expect(config.fromAddress).toBe('noreply@oyotradeministry.com.ng');
      expect(config.fromName).toBe('Oyo State Labour Registry');
      expect(config.tier).toBe('free');
      expect(config.monthlyOverageBudgetCents).toBe(3000);
      expect(config.resendMaxPerUser).toBe(3);
    });

    it('should read config from env vars', () => {
      process.env.EMAIL_PROVIDER = 'resend';
      process.env.EMAIL_ENABLED = 'false';
      process.env.EMAIL_FROM_ADDRESS = 'custom@example.com';
      process.env.EMAIL_FROM_NAME = 'Custom Name';
      process.env.EMAIL_TIER = 'pro';
      process.env.RESEND_API_KEY = 're_custom_key';
      process.env.EMAIL_MONTHLY_OVERAGE_BUDGET = '5000';
      process.env.EMAIL_RESEND_MAX_PER_USER = '5';

      const config = getEmailConfigFromEnv();

      expect(config.provider).toBe('resend');
      expect(config.enabled).toBe(false);
      expect(config.fromAddress).toBe('custom@example.com');
      expect(config.fromName).toBe('Custom Name');
      expect(config.tier).toBe('pro');
      expect(config.resendApiKey).toBe('re_custom_key');
      expect(config.monthlyOverageBudgetCents).toBe(5000);
      expect(config.resendMaxPerUser).toBe(5);
    });
  });
});
