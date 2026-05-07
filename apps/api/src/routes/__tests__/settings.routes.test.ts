/**
 * Integration tests for `apps/api/src/routes/settings.routes.ts`.
 *
 * Mocks the rate-limit middleware to a pass-through; SettingsService is also
 * mocked so we can drive each branch deterministically. **The `rbac` module
 * is NOT mocked** — `authorize(UserRole.SUPER_ADMIN)` is the real middleware,
 * so a non-super-admin user genuinely fails the gate (closes review F2 —
 * "auth gate not actually tested").
 *
 * `authenticate` is mocked but routed through a controllable `mockUser` so
 * each test can decide which role to inject.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const {
  mockListSettings,
  mockGetSetting,
  mockGetSettingRow,
  mockSetSetting,
  mockUserHolder,
} = vi.hoisted(() => ({
  mockListSettings: vi.fn(),
  mockGetSetting: vi.fn(),
  mockGetSettingRow: vi.fn(),
  mockSetSetting: vi.fn(),
  mockUserHolder: { current: { sub: 'mock-super-admin-id', role: 'super_admin' as string } },
}));

vi.mock('../../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: unknown, next: () => void) => {
    req.user = mockUserHolder.current;
    next();
  }),
}));

// `rbac.js` deliberately NOT mocked — the real `authorize(UserRole.SUPER_ADMIN)`
// runs so a non-super-admin role genuinely 403s.

vi.mock('../../middleware/settings-rate-limit.js', () => ({
  settingsListRateLimit: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  settingsWriteRateLimit: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock('../../services/settings.service.js', () => ({
  SettingsService: {
    listSettings: mockListSettings,
    getSetting: mockGetSetting,
    getSettingRow: mockGetSettingRow,
    setSetting: mockSetSetting,
  },
}));

const { default: router } = await import('../settings.routes.js');

interface AppErrorLike { code: string; message: string; statusCode: number }
function isAppErrorLike(e: unknown): e is AppErrorLike {
  return !!e && typeof e === 'object' && 'code' in e && 'statusCode' in e;
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/admin/settings', router);
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (isAppErrorLike(err)) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL', message: (err as Error).message } });
  });
  return app;
}

beforeEach(() => {
  mockListSettings.mockReset();
  mockGetSetting.mockReset();
  mockGetSettingRow.mockReset();
  mockSetSetting.mockReset();
  mockUserHolder.current = { sub: 'mock-super-admin-id', role: 'super_admin' };
});

describe('GET /admin/settings', () => {
  it('returns the settings list', async () => {
    const rows = [
      {
        key: 'auth.sms_otp_enabled',
        value: false,
        description: 'desc',
        updatedBy: 'uid',
        updatedAt: '2026-05-06T00:00:00.000Z',
        createdAt: '2026-05-06T00:00:00.000Z',
      },
    ];
    mockListSettings.mockResolvedValue(rows);

    const res = await request(buildApp()).get('/admin/settings');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ settings: rows });
  });
});

describe('GET /admin/settings/:key', () => {
  it('returns the full setting row in AC#4 shape', async () => {
    mockGetSettingRow.mockResolvedValue({
      key: 'auth.sms_otp_enabled',
      value: false,
      description: 'When true, SMS OTP becomes available for public-user auth.',
      updatedBy: 'uid-1',
      updatedAt: new Date('2026-05-06T00:00:00.000Z'),
      createdAt: new Date('2026-05-06T00:00:00.000Z'),
    });
    const res = await request(buildApp()).get('/admin/settings/auth.sms_otp_enabled');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      key: 'auth.sms_otp_enabled',
      value: false,
      description: 'When true, SMS OTP becomes available for public-user auth.',
      updated_by: 'uid-1',
      updated_at: '2026-05-06T00:00:00.000Z',
    });
  });

  it('returns 404 when key not found', async () => {
    mockGetSettingRow.mockResolvedValue(null);
    const res = await request(buildApp()).get('/admin/settings/missing.key');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SETTINGS_NOT_FOUND');
  });

  it('returns 400 on malformed key', async () => {
    const res = await request(buildApp()).get('/admin/settings/' + encodeURIComponent('!!! invalid'));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SETTINGS_INVALID_KEY');
  });
});

describe('PATCH /admin/settings/:key', () => {
  it('writes the new value and returns 204', async () => {
    mockSetSetting.mockResolvedValue(undefined);
    const res = await request(buildApp())
      .patch('/admin/settings/auth.sms_otp_enabled')
      .send({ value: true });
    expect(res.status).toBe(204);
    expect(mockSetSetting).toHaveBeenCalledWith(
      'auth.sms_otp_enabled',
      true,
      'mock-super-admin-id',
      expect.objectContaining({ ipAddress: expect.any(String) }),
      undefined,
    );
  });

  it('returns 400 when body lacks `value`', async () => {
    const res = await request(buildApp())
      .patch('/admin/settings/auth.sms_otp_enabled')
      .send({ wrong: 'shape' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SETTINGS_INVALID_BODY');
  });

  it('accepts arbitrary JSON value (string, number, object)', async () => {
    mockSetSetting.mockResolvedValue(undefined);

    await request(buildApp()).patch('/admin/settings/k').send({ value: 'string-val' }).expect(204);
    await request(buildApp()).patch('/admin/settings/k').send({ value: 42 }).expect(204);
    await request(buildApp()).patch('/admin/settings/k').send({ value: { nested: true } }).expect(204);

    expect(mockSetSetting).toHaveBeenCalledTimes(3);
  });

  it('passes optional description through to SettingsService.setSetting', async () => {
    mockSetSetting.mockResolvedValue(undefined);
    const res = await request(buildApp())
      .patch('/admin/settings/new.flag')
      .send({ value: true, description: 'A new feature flag' });
    expect(res.status).toBe(204);
    expect(mockSetSetting).toHaveBeenCalledWith(
      'new.flag',
      true,
      'mock-super-admin-id',
      expect.objectContaining({ ipAddress: expect.any(String) }),
      { description: 'A new feature flag' },
    );
  });

  it('returns 400 when description is supplied but empty/non-string', async () => {
    const res1 = await request(buildApp())
      .patch('/admin/settings/k')
      .send({ value: true, description: '' });
    expect(res1.status).toBe(400);
    expect(res1.body.error.code).toBe('SETTINGS_INVALID_BODY');

    const res2 = await request(buildApp())
      .patch('/admin/settings/k')
      .send({ value: true, description: 42 });
    expect(res2.status).toBe(400);
    expect(res2.body.error.code).toBe('SETTINGS_INVALID_BODY');
  });
});

describe('Auth gate (real authorize middleware — closes review F2)', () => {
  beforeEach(() => {
    mockUserHolder.current = { sub: 'enumerator-id', role: 'enumerator' };
  });

  it('GET /admin/settings returns 403 for non-super-admin', async () => {
    const res = await request(buildApp()).get('/admin/settings');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('GET /admin/settings/:key returns 403 for non-super-admin', async () => {
    const res = await request(buildApp()).get('/admin/settings/auth.sms_otp_enabled');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('PATCH /admin/settings/:key returns 403 for non-super-admin', async () => {
    const res = await request(buildApp())
      .patch('/admin/settings/auth.sms_otp_enabled')
      .send({ value: true });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(mockSetSetting).not.toHaveBeenCalled();
  });
});
