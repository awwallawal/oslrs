import { describe, it, expect } from 'vitest';
import { StaffService } from '../staff.service.js';

describe('StaffService', () => {
  describe('validateCsv', () => {
    it('should parse valid CSV string', async () => {
      const csvContent = `full_name,email,phone,role_name,lga_name
John Doe,john@example.com,08012345678,ENUMERATOR,Ibadan North`;
      
      const result = await StaffService.validateCsv(csvContent);
      expect(result).toHaveLength(1);
      expect(result[0].email).toBe('john@example.com');
    });

    it('should throw error on invalid CSV structure', async () => {
      // Missing required headers
      const csvContent = `invalid,header
John,Doe`;
      
      await expect(StaffService.validateCsv(csvContent)).rejects.toThrow();
    });
  });
});
