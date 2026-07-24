import { describe, it, expect } from 'vitest';
import { toSafeInternalPath } from '../safe-redirect';

describe('toSafeInternalPath — open-redirect guard (GHSA-wrjc / GHSA-jjmj)', () => {
  it('admits genuine same-origin root-relative paths unchanged', () => {
    expect(toSafeInternalPath('/')).toBe('/');
    expect(toSafeInternalPath('/dashboard')).toBe('/dashboard');
    expect(toSafeInternalPath('/registration/manage')).toBe('/registration/manage');
    expect(toSafeInternalPath('/path?tab=x&y=1')).toBe('/path?tab=x&y=1');
    expect(toSafeInternalPath('/path#frag')).toBe('/path#frag');
  });

  it('trims surrounding whitespace but keeps the path', () => {
    expect(toSafeInternalPath('  /dashboard  ')).toBe('/dashboard');
  });

  it('rejects protocol-relative targets (the //evil.com vector)', () => {
    expect(toSafeInternalPath('//evil.com')).toBe('/');
    expect(toSafeInternalPath('//evil.com/path')).toBe('/');
    expect(toSafeInternalPath('  //evil.com')).toBe('/');
  });

  it('rejects backslash bypasses (react-router 6.x does not sanitize these)', () => {
    expect(toSafeInternalPath('/\\evil.com')).toBe('/');
    expect(toSafeInternalPath('\\\\evil.com')).toBe('/');
    expect(toSafeInternalPath('/foo\\bar')).toBe('/');
  });

  it('rejects encoded slash/backslash bypasses', () => {
    expect(toSafeInternalPath('/%2fevil.com')).toBe('/');
    expect(toSafeInternalPath('/%2Fevil.com')).toBe('/');
    expect(toSafeInternalPath('/%5cevil.com')).toBe('/');
  });

  it('rejects absolute URLs and scheme-bearing targets', () => {
    expect(toSafeInternalPath('http://evil.com')).toBe('/');
    expect(toSafeInternalPath('https://evil.com')).toBe('/');
    expect(toSafeInternalPath('javascript:alert(1)')).toBe('/');
    expect(toSafeInternalPath('data:text/html,x')).toBe('/');
  });

  it('rejects control characters (e.g. newline/tab smuggling)', () => {
    expect(toSafeInternalPath('/foo\nbar')).toBe('/');
    expect(toSafeInternalPath('/foo\tbar')).toBe('/');
  });

  it('rejects empty/nullish input and honours a custom fallback', () => {
    expect(toSafeInternalPath('')).toBe('/');
    expect(toSafeInternalPath('   ')).toBe('/');
    expect(toSafeInternalPath(null)).toBe('/');
    expect(toSafeInternalPath(undefined)).toBe('/');
    expect(toSafeInternalPath('//evil.com', '/login')).toBe('/login');
    expect(toSafeInternalPath(null, '/dashboard')).toBe('/dashboard');
  });
});
