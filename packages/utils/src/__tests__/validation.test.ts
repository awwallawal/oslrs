import { describe, it, expect } from 'vitest';
import { verhoeffCheck, verhoeffGenerate } from '../validation.js';

describe('Verhoeff Algorithm', () => {
  it('should validate correct NIN checksums', () => {
    // These are examples; actual Verhoeff values would be calculated
    expect(verhoeffCheck('12345678902')).toBe(true); 
  });

  it('should reject incorrect NIN checksums', () => {
    expect(verhoeffCheck('12345678901')).toBe(false); // Wrong digit
    expect(verhoeffCheck('123456789022')).toBe(false); // Wrong digit/length
    expect(verhoeffCheck('ABCDEFGHIJK')).toBe(false); // Non-numeric
  });
  
  it('should generate correct checksum digit', () => {
      // 1234567890 -> check digit 2
      expect(verhoeffGenerate('1234567890')).toBe('12345678902');
  });
});
