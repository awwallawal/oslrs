import { describe, it, expect } from 'vitest';
import { resolveListenAddress } from '../listen-address.js';

describe('resolveListenAddress (Story 9-9 AC#3 F2)', () => {
  it('defaults host to 127.0.0.1 when HOST env var is unset', () => {
    expect(resolveListenAddress({}).host).toBe('127.0.0.1');
  });

  it('defaults host to 127.0.0.1 when HOST env var is empty string', () => {
    expect(resolveListenAddress({ HOST: '' }).host).toBe('127.0.0.1');
  });

  it('honours HOST=0.0.0.0 override (cross-container reachability)', () => {
    expect(resolveListenAddress({ HOST: '0.0.0.0' }).host).toBe('0.0.0.0');
  });

  it('honours arbitrary HOST values (e.g. tailnet IP)', () => {
    expect(resolveListenAddress({ HOST: '100.93.100.28' }).host).toBe('100.93.100.28');
  });

  it('defaults port to 3000 when PORT env var is unset', () => {
    expect(resolveListenAddress({}).port).toBe(3000);
  });

  it('coerces PORT string to number', () => {
    expect(resolveListenAddress({ PORT: '8080' }).port).toBe(8080);
  });

  it('falls back to 3000 when PORT is non-numeric', () => {
    expect(resolveListenAddress({ PORT: 'nope' }).port).toBe(3000);
  });

  it('returns both host and port together', () => {
    expect(resolveListenAddress({ HOST: '127.0.0.1', PORT: '3000' })).toEqual({
      host: '127.0.0.1',
      port: 3000,
    });
  });
});
