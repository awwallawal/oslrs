/**
 * SettingsService — audit-logged wrapper around `lib/settings.ts`.
 *
 * Per AC#3: every `setSetting` emits a SETTINGS_FLIPPED audit-log entry with
 * old_value + new_value captured. The lib's transactional setSetting returns
 * the prior value atomically (SELECT FOR UPDATE → upsert), so the audit
 * old_value is guaranteed to be the value this write overwrote — not a
 * value from a concurrent flip. Audit emit is fire-and-forget per AC#3.
 */
import {
  getSetting as libGetSetting,
  getSettingRow as libGetSettingRow,
  setSetting as libSetSetting,
  listSettings as libListSettings,
  type SetSettingOpts,
  type SettingRowShape,
} from '../lib/settings.js';
import { AuditService, AUDIT_ACTIONS } from './audit.service.js';

export class SettingsService {
  /**
   * Read a setting (delegates to lib — Redis-cached).
   */
  static async getSetting<T>(key: string): Promise<T | null> {
    return libGetSetting<T>(key);
  }

  /**
   * Read a setting's full row (key + value + description + audit metadata).
   * Used by GET /:key for AC#4 response shape.
   */
  static async getSettingRow(key: string): Promise<SettingRowShape | null> {
    return libGetSettingRow(key);
  }

  /**
   * Write a setting + emit SETTINGS_FLIPPED audit event.
   *
   * `old_value` is captured atomically inside the lib's transaction (via
   * SELECT FOR UPDATE), then returned here to populate the audit details —
   * accurate even under concurrent flips.
   *
   * @param key      Setting key (e.g. 'auth.sms_otp_enabled')
   * @param newValue Value to set
   * @param actorId  Super-admin user id performing the flip
   * @param ctx      Optional request context for audit log (ip, userAgent)
   * @param opts     Optional setSetting options (e.g. description)
   */
  static async setSetting<T>(
    key: string,
    newValue: T,
    actorId: string,
    ctx?: { ipAddress?: string; userAgent?: string },
    opts?: SetSettingOpts,
  ): Promise<void> {
    const oldValue = await libSetSetting<T>(key, newValue, actorId, opts);

    // Fire-and-forget — never blocks the write path
    AuditService.logAction({
      actorId,
      action: AUDIT_ACTIONS.SETTINGS_FLIPPED,
      targetResource: 'system_settings',
      targetId: null,
      details: {
        key,
        old_value: oldValue,
        new_value: newValue,
      },
      ipAddress: ctx?.ipAddress,
      userAgent: ctx?.userAgent,
    });
  }

  /**
   * List all settings (delegates to lib — uncached).
   */
  static async listSettings() {
    return libListSettings();
  }
}
