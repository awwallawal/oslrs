import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SMSService, MockSMSProvider, HttpSMSProvider, getMockSMSProvider, resetMockSMSProvider } from '../sms.service.js';

describe('SMSService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetMockSMSProvider();
  });

  describe('MockSMSProvider', () => {
    it('should store sent messages in memory', async () => {
      const provider = new MockSMSProvider();
      const result = await provider.send('+2348012345678', 'Test message');

      expect(result.success).toBe(true);
      expect(result.messageId).toMatch(/^mock-\d+$/);
      expect(provider.sentMessages).toHaveLength(1);
      expect(provider.sentMessages[0]).toEqual({
        to: '+2348012345678',
        message: 'Test message',
        timestamp: expect.any(Date),
      });
    });

    it('should accumulate messages across sends', async () => {
      const provider = new MockSMSProvider();
      await provider.send('+2348012345678', 'Message 1');
      await provider.send('+2349087654321', 'Message 2');

      expect(provider.sentMessages).toHaveLength(2);
    });

    it('should clear messages on clear()', async () => {
      const provider = new MockSMSProvider();
      await provider.send('+2348012345678', 'Message 1');
      provider.clear();

      expect(provider.sentMessages).toHaveLength(0);
    });

    it('should have name "mock"', () => {
      const provider = new MockSMSProvider();
      expect(provider.name).toBe('mock');
    });
  });

  describe('HttpSMSProvider', () => {
    it('should have name "http"', () => {
      const provider = new HttpSMSProvider({
        apiUrl: 'https://api.example.com/send',
        apiKey: 'test-key',
        senderId: 'OSLRS',
      });
      expect(provider.name).toBe('http');
    });

    it('should call fetch with correct params on send', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ message_id: 'msg-123' }),
      });
      global.fetch = mockFetch;

      const provider = new HttpSMSProvider({
        apiUrl: 'https://api.example.com/send',
        apiKey: 'test-key',
        senderId: 'OSLRS',
      });

      const result = await provider.send('+2348012345678', 'Hello!');

      expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-key',
        },
        body: JSON.stringify({
          to: '+2348012345678',
          from: 'OSLRS',
          sms: 'Hello!',
        }),
      });
      expect(result.success).toBe(true);
      expect(result.messageId).toBe('msg-123');
    });

    it('should return error on non-ok response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Bad request'),
      });

      const provider = new HttpSMSProvider({
        apiUrl: 'https://api.example.com/send',
        apiKey: 'test-key',
        senderId: 'OSLRS',
      });

      const result = await provider.send('+2348012345678', 'Hello!');

      expect(result.success).toBe(false);
      expect(result.error).toContain('HTTP 400');
    });

    it('should return error on fetch failure', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const provider = new HttpSMSProvider({
        apiUrl: 'https://api.example.com/send',
        apiKey: 'test-key',
        senderId: 'OSLRS',
      });

      const result = await provider.send('+2348012345678', 'Hello!');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });

  describe('SMSService.send', () => {
    it('should delegate to mock provider in test mode', async () => {
      const result = await SMSService.send('+2348012345678', 'Test SMS');

      expect(result.success).toBe(true);
      const mock = getMockSMSProvider();
      expect(mock.sentMessages).toHaveLength(1);
      expect(mock.sentMessages[0].to).toBe('+2348012345678');
    });

    it('should return failure when disabled', async () => {
      const origProvider = process.env.SMS_PROVIDER;
      process.env.SMS_PROVIDER = 'disabled';

      // Force re-initialize
      (SMSService as any).provider = null;
      const result = await SMSService.send('+2348012345678', 'Test');

      expect(result.success).toBe(false);
      expect(result.error).toBe('SMS service is disabled');

      process.env.SMS_PROVIDER = origProvider;
      (SMSService as any).provider = null;
    });
  });

  describe('getMockSMSProvider', () => {
    it('should return singleton instance', () => {
      const a = getMockSMSProvider();
      const b = getMockSMSProvider();
      expect(a).toBe(b);
    });
  });
});
