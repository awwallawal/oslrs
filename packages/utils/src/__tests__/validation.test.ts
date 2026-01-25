import { describe, it, expect } from 'vitest';
import { verhoeffCheck, verhoeffGenerate, modulus11Check, modulus11Generate } from '../validation.js';

describe('Modulus 11 Algorithm (Nigerian NIN)', () => {
  it('should validate real Nigerian NINs', () => {
    // Real government-issued NINs
    expect(modulus11Check('61961438053')).toBe(true);
    expect(modulus11Check('21647846180')).toBe(true);
  });

  it('should validate generated NINs', () => {
    expect(modulus11Check('12345678919')).toBe(true); // Generated from 1234567891
  });

  it('should reject incorrect NIN checksums', () => {
    expect(modulus11Check('61961438050')).toBe(false); // Wrong check digit
    expect(modulus11Check('21647846181')).toBe(false); // Wrong check digit
    expect(modulus11Check('12345678910')).toBe(false); // Wrong digit
  });

  it('should reject invalid formats', () => {
    expect(modulus11Check('1234567890')).toBe(false);   // Too short (10 digits)
    expect(modulus11Check('123456789012')).toBe(false); // Too long (12 digits)
    expect(modulus11Check('ABCDEFGHIJK')).toBe(false);  // Non-numeric
    expect(modulus11Check('1234567890A')).toBe(false);  // Mixed
  });

  it('should generate correct check digit', () => {
    expect(modulus11Generate('1234567891')).toBe('12345678919');
    expect(modulus11Generate('6196143805')).toBe('61961438053');
    expect(modulus11Generate('2164784618')).toBe('21647846180');
  });

  it('should throw for base numbers that produce check digit 10', () => {
    // 1234567890 produces check digit 10, which is invalid
    expect(() => modulus11Generate('1234567890')).toThrow('cannot have a valid Modulus 11 check digit');
  });

  it('should throw error for invalid input length', () => {
    expect(() => modulus11Generate('123456789')).toThrow('Input must be exactly 10 digits');
    expect(() => modulus11Generate('12345678901')).toThrow('Input must be exactly 10 digits');
  });
});

describe('Verhoeff Algorithm (Legacy)', () => {
  it('should validate correct checksums', () => {
    expect(verhoeffCheck('12345678902')).toBe(true);
  });

  it('should reject incorrect checksums', () => {
    expect(verhoeffCheck('12345678901')).toBe(false); // Wrong digit
    expect(verhoeffCheck('123456789022')).toBe(false); // Wrong digit/length
    expect(verhoeffCheck('ABCDEFGHIJK')).toBe(false); // Non-numeric
  });

  it('should generate correct checksum digit', () => {
    expect(verhoeffGenerate('1234567890')).toBe('12345678902');
  });
});
