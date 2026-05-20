import { pgTable, uuid, text, timestamp, integer, jsonb, index } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';

/**
 * Story 9-12 AC#9: server-side wizard draft storage.
 *
 * Per story Dev Notes "Server-side draft vs IndexedDB":
 * The wizard stores drafts in BOTH IndexedDB (local, fast, offline-tolerant) AND
 * server-side (this table). Reason: IndexedDB alone breaks the cross-device
 * return-to-complete UX (respondent starts on phone, finishes on laptop).
 *
 * Server-side draft is the SOURCE OF TRUTH on magic-link redemption.
 * IndexedDB is the source of truth during a single session.
 * Last-write-wins reconciliation if both are updated.
 *
 * Keyed by email because new public registrants don't have a user_id yet.
 * Email is the natural identifier across the wizard's not-yet-account-created
 * phase. After registration completes, the draft is deleted.
 *
 * Shape of `formData` JSONB column: partial form state from any step (1-5).
 * Field names mirror the wizard step contracts (fullName, dateOfBirth, gender,
 * phone, email, lgaId, consentMarketplace, consentEnriched, ninPending,
 * questionnaireResponses, etc.). Stored as merge-on-write.
 *
 * MUST NOT import from @oslsr/types — drizzle-kit runs compiled JS (per MEMORY.md key pattern).
 */

/**
 * Shape of the `wizard_drafts.form_data` JSONB column. Partial — any step may
 * have written its slice; missing keys mean that step hasn't been visited yet.
 * Treat as merge-on-write at the application layer.
 */
export interface WizardDraftData {
  // Step 1
  fullName?: string;
  dateOfBirth?: string;
  gender?: string;
  // Step 2
  phone?: string;
  email?: string;
  lgaId?: string;
  // Step 3
  consentMarketplace?: boolean;
  consentEnriched?: boolean;
  // Step 4 (questionnaire responses indexed by question id)
  questionnaireResponses?: Record<string, unknown>;
  // Step 5
  nin?: string;
  pendingNinToggle?: boolean;
  authChoice?: 'magic-link' | 'password' | 'skip';
  // Step 4 introspection results (stamped on FormRenderer mount per Story 9-12
  // Task 4.6 + 5.4.5). Used by the Step 5 state-aware NIN dispatcher AND by
  // Story 9-26 submit handler to populate `submissions.questionnaireFormId`.
  formHasNinQuestion?: boolean;
  questionnaireFormId?: string;
  questionnaireFormVersionId?: string;
  // Free-form for forward-compat
  extras?: Record<string, unknown>;
}

export const wizardDrafts = pgTable(
  'wizard_drafts',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),

    /** Natural key: the email entered in Step 2 of the wizard. Unique per draft. */
    email: text('email').notNull().unique(),

    /** Last visited step (1-5). Hydration on resume scrolls to this step. */
    currentStep: integer('current_step').notNull().default(1),

    /** Partial form state. Merge-on-write at application layer. */
    formData: jsonb('form_data').$type<WizardDraftData>().notNull().default({}),

    /** When the draft was last touched. Used for stale-draft cleanup. */
    lastUpdatedAt: timestamp('last_updated_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),

    /** Hard expiry; cleanup sweep removes drafts past this date (typ. 30 days). */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    // Fast cleanup sweep of expired drafts.
    idxExpiresAt: index('idx_wizard_drafts_expires_at').on(table.expiresAt),
    // (Email already has UNIQUE constraint above, providing the lookup index.)
  }),
);

export type WizardDraft = typeof wizardDrafts.$inferSelect;
export type NewWizardDraft = typeof wizardDrafts.$inferInsert;
