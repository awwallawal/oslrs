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
import { assertPinnedFormHonoursIngestionContract } from './public-form-pin-guard.js'; // Story 13-57 (AC5)

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
    /**
     * ⭐ STORY 13-57 AC5.2 — THE PIN IS THE BLOCKING MOMENT, AND THIS IS THE
     * CHOKEPOINT IT CANNOT BE ROUTED AROUND.
     *
     * Pinning `wizard.public_form_id` is the act of declaring "THIS form now
     * feeds the public register". A re-upload mints a NEW form row and requires
     * a re-pin ([[project_public_wizard_form_update]]), so this is exactly the
     * moment a renamed or dropped field would otherwise start losing data in
     * silence — with the whole public channel behind it.
     *
     * Placed in the SERVICE rather than in `settings.routes.ts` deliberately: a
     * route guard protects the UI and nothing else, and this is the layer every
     * application caller goes through. Throws BEFORE `libSetSetting`, so a
     * refused pin writes nothing at all.
     *
     * ⚠️ CORRECTED 2026-08-14 (code review, M2). This comment used to justify
     * the placement by saying "the operator scripts in `apps/api/scripts/` set
     * this key too". Measured: **no script in `apps/api/scripts/` calls
     * `setSetting` at all.** `settings.routes.ts:139` is the only caller today.
     * The placement is still the right one — a service guard survives the next
     * caller, a route guard does not — but the reason given was a plausible
     * claim nobody had run the grep for, which is the exact habit this project
     * keeps paying for ([[feedback_verify_against_reality_before_asserting]]).
     *
     * ⚠️ ONE WRITER GENUINELY BYPASSES THIS, AND IT IS FINE.
     * `scripts/migrate-system-settings-init.ts:89-115` seeds the key with a raw
     * idempotent INSERT at deploy time. It writes the SEED, not a pin — there is
     * no form id for a contract to be violated against — so there is nothing for
     * this guard to check. Named here so the exception is a decision on the
     * record rather than a hole somebody finds later
     * ([[pattern-census-counts-sites-not-callers]]).
     */
    await assertPinnedFormHonoursIngestionContract(key, newValue);

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
