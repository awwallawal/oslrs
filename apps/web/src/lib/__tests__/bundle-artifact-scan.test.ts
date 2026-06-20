import { describe, it, expect } from 'vitest';
import { scanBundle } from '../bundle-artifact-scan';

describe('scanBundle (F-003 prod-bundle artifact scan)', () => {
  it('passes a clean bundle', () => {
    expect(
      scanBundle([
        { file: 'dist/assets/index-abc.js', content: 'fetch("/api/v1/users")' },
        { file: 'dist/assets/style-abc.css', content: '.a{color:red}' },
      ]),
    ).toEqual([]);
  });

  it('flags a shipped source map file', () => {
    const v = scanBundle([{ file: 'dist/assets/index-abc.js.map', content: '' }]);
    expect(v).toHaveLength(1);
    expect(v[0].issue).toContain('source map file');
  });

  it('flags a sourceMappingURL reference', () => {
    const v = scanBundle([
      { file: 'dist/assets/index-abc.js', content: 'x=1\n//# sourceMappingURL=index-abc.js.map' },
    ]);
    expect(v.some((e) => e.issue.includes('sourceMappingURL'))).toBe(true);
  });

  it('flags a hard-coded dev origin', () => {
    const v = scanBundle([
      { file: 'dist/assets/index-abc.js', content: 'const API="http://localhost:3000/api"' },
    ]);
    expect(v.some((e) => e.issue.includes('dev origin'))).toBe(true);
  });

  it('does NOT false-flag an incidental "localhost" substring without a dev port', () => {
    expect(
      scanBundle([{ file: 'dist/assets/vendor.js', content: 'const help="see localhost docs"' }]),
    ).toEqual([]);
  });
});
