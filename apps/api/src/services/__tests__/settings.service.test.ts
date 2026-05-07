/**
 * Unit tests for SettingsService — verifies audit-log emission with
 * old_value + new_value capture (AC#3). Updated post-code-review F3:
 * lib `setSetting` now returns the prior value atomically; service uses
 * that returned value (no separate `getSetting` call).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLibGet, mockLibGetRow, mockLibSet, mockLibList, mockLogAction } = vi.hoisted(() => ({
  mockLibGet: vi.fn(),
  mockLibGetRow: vi.fn(),
  mockLibSet: vi.fn(),
  mockLibList: vi.fn(),
  mockLogAction: vi.fn(),
}));

vi.mock('../../lib/settings.js', () => ({
  getSetting: mockLibGet,
  getSettingRow: mockLibGetRow,
  setSetting: mockLibSet,
  listSettings: mockLibList,
}));

vi.mock('../audit.service.js', () => ({
  AuditService: { logAction: mockLogAction },
  AUDIT_ACTIONS: { SETTINGS_FLIPPED: 'settings.flipped' },
}));

const { SettingsService } = await import('../settings.service.js');

beforeEach(() => {
  mockLibGet.mockReset();
  mockLibGetRow.mockReset();
  mockLibSet.mockReset();
  mockLibList.mockReset();
  mockLogAction.mockReset();
});

describe('SettingsService.setSetting', () => {
  it('emits SETTINGS_FLIPPED audit event with prior value returned by lib', async () => {
    mockLibSet.mockResolvedValue(false); // lib returns prior value

    await SettingsService.setSetting<boolean>(
      'auth.sms_otp_enabled',
      true,
      '00000000-0000-0000-0000-000000000000',
      { ipAddress: '1.2.3.4', userAgent: 'test' },
    );

    expect(mockLibSet).toHaveBeenCalledWith(
      'auth.sms_otp_enabled',
      true,
      '00000000-0000-0000-0000-000000000000',
      undefined,
    );
    expect(mockLogAction).toHaveBeenCalledWith({
      actorId: '00000000-0000-0000-0000-000000000000',
      action: 'settings.flipped',
      targetResource: 'system_settings',
      targetId: null,
      details: {
        key: 'auth.sms_otp_enabled',
        old_value: false,
        new_value: true,
      },
      ipAddress: '1.2.3.4',
      userAgent: 'test',
    });
  });

  it('records old_value=null when key is new (lib returns null)', async () => {
    mockLibSet.mockResolvedValue(null);

    await SettingsService.setSetting('new.key', 42, 'actor-id');

    expect(mockLogAction).toHaveBeenCalledWith(
      expect.objectContaining({
        details: { key: 'new.key', old_value: null, new_value: 42 },
      }),
    );
  });

  it('does not call libGetSetting separately (prior value comes from atomic setSetting)', async () => {
    mockLibSet.mockResolvedValue(false);
    await SettingsService.setSetting('k', true, 'actor');
    expect(mockLibGet).not.toHaveBeenCalled();
  });

  it('calls audit logAction AFTER the lib write completes (write-then-audit ordering)', async () => {
    const callOrder: string[] = [];
    mockLibSet.mockImplementation(async () => {
      callOrder.push('set');
      return false;
    });
    mockLogAction.mockImplementation(() => {
      callOrder.push('audit');
    });

    await SettingsService.setSetting('k', true, 'actor');

    expect(callOrder).toEqual(['set', 'audit']);
  });

  it('omits ip/userAgent fields when ctx not provided', async () => {
    mockLibSet.mockResolvedValue(false);

    await SettingsService.setSetting('k', true, 'actor-id');

    expect(mockLogAction).toHaveBeenCalledWith(
      expect.objectContaining({
        ipAddress: undefined,
        userAgent: undefined,
      }),
    );
  });

  it('passes optional description through to lib', async () => {
    mockLibSet.mockResolvedValue(null);

    await SettingsService.setSetting(
      'k',
      'v',
      'actor-id',
      undefined,
      { description: 'a fresh setting' },
    );

    expect(mockLibSet).toHaveBeenCalledWith('k', 'v', 'actor-id', { description: 'a fresh setting' });
  });
});

describe('SettingsService.getSetting / getSettingRow / listSettings', () => {
  it('getSetting delegates to lib without audit emit', async () => {
    mockLibGet.mockResolvedValue(true);
    const v = await SettingsService.getSetting<boolean>('auth.sms_otp_enabled');
    expect(v).toBe(true);
    expect(mockLogAction).not.toHaveBeenCalled();
  });

  it('getSettingRow delegates to lib without audit emit', async () => {
    const row = {
      key: 'k',
      value: 'v',
      description: null,
      updatedBy: 'u',
      updatedAt: new Date(),
      createdAt: new Date(),
    };
    mockLibGetRow.mockResolvedValue(row);
    const out = await SettingsService.getSettingRow('k');
    expect(out).toEqual(row);
    expect(mockLogAction).not.toHaveBeenCalled();
  });

  it('listSettings delegates to lib without audit emit', async () => {
    mockLibList.mockResolvedValue([]);
    await SettingsService.listSettings();
    expect(mockLibList).toHaveBeenCalled();
    expect(mockLogAction).not.toHaveBeenCalled();
  });
});
