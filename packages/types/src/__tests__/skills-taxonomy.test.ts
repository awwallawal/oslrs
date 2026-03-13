import { describe, it, expect } from 'vitest';
import { ISCO08_SECTOR_MAP, ISCO08_SECTORS } from '../skills-taxonomy.js';

describe('ISCO-08 Skills Taxonomy', () => {
  it('SECTOR_MAP has 151 skill entries', () => {
    expect(Object.keys(ISCO08_SECTOR_MAP)).toHaveLength(151);
  });

  it('SECTORS has 20 unique sector values', () => {
    expect(ISCO08_SECTORS).toHaveLength(20);
    // Verify all are unique
    expect(new Set(ISCO08_SECTORS).size).toBe(20);
  });
});
