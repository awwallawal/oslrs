import { describe, it, expect } from 'vitest';
import {
  activationSchema,
  activationWithSelfieSchema,
  selfieBase64Schema,
  ninSchema,
} from '../profile.js';

// Valid test data using real NIN with correct Modulus 11 checksum
const validActivationData = {
  password: 'SecurePass123!',
  nin: '12345678919', // Valid NIN with correct Modulus 11 checksum (generated from 1234567891)
  dateOfBirth: '1990-05-15',
  homeAddress: '123 Main Street, Lagos',
  bankName: 'First Bank',
  accountNumber: '1234567890',
  accountName: 'John Doe',
  nextOfKinName: 'Jane Doe',
  nextOfKinPhone: '08012345678',
};

// Small valid base64 image (1x1 red pixel JPEG)
const validBase64Image = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAB//2Q==';

// Raw base64 without data URL prefix
const rawBase64Image = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAB//2Q==';

describe('NIN Schema', () => {
  it('should validate a valid NIN', () => {
    // Using valid NIN with correct Modulus 11 checksum
    const result = ninSchema.safeParse('12345678919');
    expect(result.success).toBe(true);
  });

  it('should fail on NIN with wrong length', () => {
    const result = ninSchema.safeParse('1234567890');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toContain('11 digits');
    }
  });

  it('should fail on NIN with non-digit characters', () => {
    const result = ninSchema.safeParse('1234567890A');
    expect(result.success).toBe(false);
  });

  it('should fail on invalid NIN checksum', () => {
    const result = ninSchema.safeParse('12345678901'); // Invalid checksum
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toContain('checksum');
    }
  });
});

describe('Activation Schema', () => {
  it('should validate valid activation data', () => {
    const result = activationSchema.safeParse(validActivationData);
    expect(result.success).toBe(true);
  });

  it('should fail on password too short', () => {
    const result = activationSchema.safeParse({
      ...validActivationData,
      password: 'short',
    });
    expect(result.success).toBe(false);
  });

  it('should fail on invalid date format', () => {
    const result = activationSchema.safeParse({
      ...validActivationData,
      dateOfBirth: '15-05-1990',
    });
    expect(result.success).toBe(false);
  });

  it('should fail on invalid account number length', () => {
    const result = activationSchema.safeParse({
      ...validActivationData,
      accountNumber: '123456789', // 9 digits instead of 10
    });
    expect(result.success).toBe(false);
  });
});

describe('Selfie Base64 Schema', () => {
  it('should validate data URL format base64', () => {
    const result = selfieBase64Schema.safeParse(validBase64Image);
    expect(result.success).toBe(true);
  });

  it('should validate raw base64 without data URL prefix', () => {
    const result = selfieBase64Schema.safeParse(rawBase64Image);
    expect(result.success).toBe(true);
  });

  it('should accept PNG data URL format', () => {
    const pngDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const result = selfieBase64Schema.safeParse(pngDataUrl);
    expect(result.success).toBe(true);
  });

  it('should accept WebP data URL format', () => {
    const webpDataUrl = 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=';
    const result = selfieBase64Schema.safeParse(webpDataUrl);
    expect(result.success).toBe(true);
  });

  it('should fail on invalid base64 characters', () => {
    const result = selfieBase64Schema.safeParse('invalid!@#$%base64');
    expect(result.success).toBe(false);
  });

  it('should fail on base64 that exceeds max size', () => {
    // Create a string larger than 2.67MB
    const largeBase64 = 'A'.repeat(3 * 1024 * 1024);
    const result = selfieBase64Schema.safeParse(largeBase64);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toContain('too large');
    }
  });
});

describe('Activation With Selfie Schema', () => {
  it('should validate activation data without selfie (backward compatible)', () => {
    const result = activationWithSelfieSchema.safeParse(validActivationData);
    expect(result.success).toBe(true);
  });

  it('should validate activation data with valid selfie', () => {
    const result = activationWithSelfieSchema.safeParse({
      ...validActivationData,
      selfieBase64: validBase64Image,
    });
    expect(result.success).toBe(true);
  });

  it('should fail if selfie is provided but invalid', () => {
    const result = activationWithSelfieSchema.safeParse({
      ...validActivationData,
      selfieBase64: 'not-valid-base64!@#',
    });
    expect(result.success).toBe(false);
  });

  it('should still require all base activation fields', () => {
    const result = activationWithSelfieSchema.safeParse({
      password: 'SecurePass123!',
      selfieBase64: validBase64Image,
      // Missing other required fields
    });
    expect(result.success).toBe(false);
  });

  it('should allow undefined selfieBase64', () => {
    const result = activationWithSelfieSchema.safeParse({
      ...validActivationData,
      selfieBase64: undefined,
    });
    expect(result.success).toBe(true);
  });
});
