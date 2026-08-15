/**
 * Unit tests for SettingsService — verifies audit-log emission with
 * old_value + new_value capture (AC#3). Updated post-code-review F3:
 * lib `setSetting` now returns the prior value atomically; service uses
 * that returned value (no separate `getSetting` call).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLibGet, mockLibGetRow, mockLibSet, mockLibList, mockLogAction, mockPinGuard } =
  vi.hoisted(() => ({
    mockLibGet: vi.fn(),
    mockLibGetRow: vi.fn(),
    mockLibSet: vi.fn(),
    mockLibList: vi.fn(),
    mockLogAction: vi.fn(),
    // Story 13-57 (AC5.2) — the guard's OWN logic is covered in
    // public-form-pin-guard.test.ts; here it is mocked so these tests can assert
    // the one thing only this layer decides: that it runs, and that it runs
    // BEFORE the write.
    mockPinGuard: vi.fn(),
  }));

vi.mock('../public-form-pin-guard.js', () => ({
  assertPinnedFormHonoursIngestionContract: mockPinGuard,
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
  mockPinGuard.mockReset();
  mockPinGuard.mockResolvedValue(undefined);
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

  /**
   * ⭐ STORY 13-57 AC5.2 — THE GUARD LIVES HERE, NOT ON THE ROUTE.
   *
   * A route-level guard protects the admin UI and nothing else, and the
   * operator scripts in `apps/api/scripts/` write this key too. A guard that
   * covers one caller is the failure mode this project keeps re-learning
   * ([[pattern-ship-a-fix-that-never-fires]]).
   */
  describe('13-57 — the public-form pin guard runs on the write chokepoint', () => {
    it('consults the guard on EVERY setting write, whatever the key', async () => {
      mockLibSet.mockResolvedValue(null);
      await SettingsService.setSetting('wizard.public_form_id', 'form-1', 'actor');
      expect(mockPinGuard).toHaveBeenCalledWith('wizard.public_form_id', 'form-1');
    });

    it('a refused pin writes NOTHING and audits NOTHING', async () => {
      mockLibSet.mockResolvedValue(null);
      mockPinGuard.mockRejectedValue(new Error('FORM_INGESTION_CONTRACT_VIOLATION'));

      await expect(
        SettingsService.setSetting('wizard.public_form_id', 'form-1', 'actor'),
      ).rejects.toThrow('FORM_INGESTION_CONTRACT_VIOLATION');

      // Order matters: a half-applied pin would leave the public wizard
      // rendering a form the register cannot read, which is worse than no pin.
      expect(mockLibSet).not.toHaveBeenCalled();
      expect(mockLogAction).not.toHaveBeenCalled();
    });
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
