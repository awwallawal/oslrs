import { describe, it, expect } from 'vitest';
import { staffImportRowSchema } from '../staff.js';

describe('Staff Import Validation', () => {
  it('should validate a valid staff row', () => {
    const validRow = {
      full_name: 'John Doe',
      email: 'john@example.com',
      phone: '08012345678',
      role_name: 'ENUMERATOR',
      lga_name: 'Ibadan North'
    };
    
    const result = staffImportRowSchema.safeParse(validRow);
    expect(result.success).toBe(true);
  });

  it('should fail on invalid email', () => {
    const invalidRow = {
      full_name: 'John Doe',
      email: 'not-an-email',
      phone: '08012345678',
      role_name: 'ENUMERATOR',
      lga_name: 'Ibadan North'
    };
    
    const result = staffImportRowSchema.safeParse(invalidRow);
    expect(result.success).toBe(false);
  });
});