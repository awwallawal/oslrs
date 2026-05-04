import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';

/**
 * API Consumers — third-party MDA partners (ITF-SUPA, NBS, NIMC, research
 * institutions) authorized to access the OSLRS partner-API surface.
 *
 * **Schema landed here in Story 9-11 (Schema Down Payment) ahead of Story 10-1
 * (Consumer Authentication Layer).** 10-1 owns the `api_keys` + `api_key_scopes`
 * tables and the `apiKeyAuth` middleware on top of this base table. This story
 * lands the table itself because the audit log viewer must `LEFT JOIN` it for
 * principal-name resolution per Architecture Decision 5.4 (audit-log principal
 * dualism).
 *
 * Rationale for the schema-ahead split: 9-11's audit viewer needs the table
 * exists() and the FK target on day one to render Consumer-principal rows; it
 * does NOT need the auth surface 10-1 provides. Landing the production-shape
 * table here (8 cols matching 10-1 AC#1) avoids the re-migration risk a minimal
 * scaffold would create.
 *
 * Drizzle constraint: schema files MUST NOT import from `@oslsr/types`
 * (drizzle-kit runs compiled JS; `@oslsr/types` has no `dist/`). Per
 * MEMORY.md "Key Patterns". Enum value constants are inlined here as
 * `as const` arrays; canonical re-export should land in @oslsr/types when
 * 10-1 ships the auth surface.
 */

// Enum value constants — inlined per drizzle-kit / @oslsr/types pattern.
// Canonical source on 10-1 land: packages/types/src/api-consumer.ts (TBD).
export const apiConsumerOrganisationTypes = [
  'federal_mda',
  'state_mda',
  'research_institution',
  'other',
] as const;
export type ApiConsumerOrganisationType =
  (typeof apiConsumerOrganisationTypes)[number];

export const apiConsumerStatuses = [
  'active',
  'suspended',
  'terminated',
] as const;
export type ApiConsumerStatus = (typeof apiConsumerStatuses)[number];

export const apiConsumers = pgTable(
  'api_consumers',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    name: text('name').notNull(),
    organisationType: text('organisation_type', {
      enum: apiConsumerOrganisationTypes,
    }).notNull(),
    contactEmail: text('contact_email').notNull(),
    // Nullable here; 10-1 service layer enforces non-null when the
    // submissions:read_pii scope is requested (per 10-1 AC#7).
    dsaDocumentUrl: text('dsa_document_url'),
    status: text('status', { enum: apiConsumerStatuses })
      .notNull()
      .default('active'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdateFn(() => new Date()),
  },
  (table) => ({
    statusIdx: index('idx_api_consumers_status').on(table.status),
    contactEmailIdx: index('idx_api_consumers_contact_email').on(
      table.contactEmail
    ),
  })
);
