/**
 * One-time migration script: XLSForm → Native Form Schema
 *
 * Reads test-fixtures/oslsr_master_v3.xlsx, converts to NativeFormSchema,
 * validates via Zod, and stores in questionnaire_forms table.
 *
 * Run with: pnpm migrate:xlsform
 * Or:       pnpm tsx scripts/migrate-xlsform-to-native.ts
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { pgTable, uuid, text, timestamp, integer, boolean, jsonb, index, unique } from 'drizzle-orm/pg-core';
import { eq, and } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { XlsformParserService } from '../apps/api/src/services/xlsform-parser.service.js';
import { nativeFormSchema } from '@oslsr/types';
import { convertToNativeForm, getMigrationSummary } from '../apps/api/src/services/xlsform-to-native-converter.js';

// ── Setup ────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

dotenv.config({ path: path.resolve(projectRoot, '.env') });

// ── Inline table schemas (avoids deep import chains from apps/api) ──────
// NOTE: These are simplified copies of the real schemas in apps/api/src/db/schema/.
// They only include columns used by this script. If the real schemas change
// (e.g., new required columns), this script may need updating to match.

const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  roleId: uuid('role_id'),
});

const roles = pgTable('roles', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
});

const questionnaireForms = pgTable('questionnaire_forms', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
  formId: text('form_id').notNull(),
  version: text('version').notNull(),
  title: text('title').notNull(),
  status: text('status').notNull().default('draft'),
  fileHash: text('file_hash').notNull(),
  fileName: text('file_name').notNull(),
  fileSize: integer('file_size').notNull(),
  mimeType: text('mime_type').notNull(),
  formSchema: jsonb('form_schema'),
  isNative: boolean('is_native').default(false),
  nativePublishedAt: timestamp('native_published_at', { withTimezone: true }),
  uploadedBy: uuid('uploaded_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  formIdIdx: index('idx_forms_form_id').on(table.formId),
  statusIdx: index('idx_forms_status').on(table.status),
  fileHashIdx: index('idx_forms_file_hash').on(table.fileHash),
  formIdVersionUnique: unique('uq_forms_form_id_version').on(table.formId, table.version),
}));

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔════════════════════════════════════════════╗');
  console.log('║   XLSForm → Native Form Migration Script  ║');
  console.log('╚════════════════════════════════════════════╝\n');

  // Step 1: Read the XLSForm file
  const xlsPath = path.resolve(projectRoot, 'test-fixtures/oslsr_master_v3.xlsx');
  console.log(`📄 Reading XLSForm: ${xlsPath}`);

  let fileBuffer: Buffer;
  try {
    fileBuffer = readFileSync(xlsPath);
    console.log(`   File size: ${fileBuffer.length} bytes\n`);
  } catch {
    console.error('❌ Failed to read XLSForm file:', xlsPath);
    process.exit(1);
  }

  // Step 2: Parse using XlsformParserService
  console.log('🔍 Parsing XLSForm worksheets...');
  let parsed;
  try {
    parsed = XlsformParserService.parseXlsxFile(fileBuffer);
    console.log(`   Survey rows: ${parsed.survey.length}`);
    console.log(`   Choice rows: ${parsed.choices.length}`);
    console.log(`   Form ID: ${parsed.settings.form_id}`);
    console.log(`   Form title: ${parsed.settings.form_title}`);
    console.log(`   XLSForm version: ${parsed.settings.version}\n`);
  } catch (err) {
    console.error('❌ XLSForm parsing failed:', (err as Error).message);
    process.exit(1);
  }

  // Step 3: Convert to NativeFormSchema
  console.log('🔄 Converting to native form schema...');
  const nativeSchema = convertToNativeForm(parsed);
  const summary = getMigrationSummary(nativeSchema);

  console.log(`   Sections: ${summary.sectionCount}`);
  for (const section of nativeSchema.sections) {
    const showWhenNote = section.showWhen ? ' (has showWhen)' : '';
    console.log(`     → ${section.title}: ${section.questions.length} questions${showWhenNote}`);
  }
  console.log(`   Total questions: ${summary.questionCount}`);
  console.log(`   Choice lists: ${summary.choiceListCount}`);
  for (const [listName, choices] of Object.entries(nativeSchema.choiceLists)) {
    console.log(`     → ${listName}: ${choices.length} choices`);
  }
  console.log(`   Skip logic conditions: ${summary.skipLogicCount}`);
  console.log();

  // Step 4: Validate via Zod
  console.log('✅ Validating against nativeFormSchema (Zod)...');
  const zodResult = nativeFormSchema.safeParse(nativeSchema);
  if (!zodResult.success) {
    console.error('❌ Zod validation FAILED:');
    for (const issue of zodResult.error.issues) {
      console.error(`   - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }
  console.log('   Zod validation: PASS ✓\n');

  // Step 5: Store in database
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not set. Cannot store in database.');
    console.log('   The NativeFormSchema was generated and validated successfully.');
    console.log('   Set DATABASE_URL in .env to enable database storage.');
    process.exit(1);
  }

  console.log('💾 Storing in database...');
  const { Pool } = pg;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema: { users, roles, questionnaireForms } });

  try {
    // Check if already migrated (uses nativeSchema.version instead of hardcoded string)
    const existing = await db.select({ id: questionnaireForms.id })
      .from(questionnaireForms)
      .where(
        and(
          eq(questionnaireForms.formId, parsed.settings.form_id),
          eq(questionnaireForms.version, nativeSchema.version),
          eq(questionnaireForms.isNative, true),
        )
      );

    if (existing.length > 0) {
      console.log(`   ℹ️  Form already migrated (ID: ${existing[0].id}). Skipping DB insert.`);
      await pool.end();
      console.log('\n🎉 Migration already complete — nothing to do.');
      process.exit(0);
    }

    // Wrap lookup + insert in a transaction for atomicity
    const created = await db.transaction(async (tx) => {
      // Find Super Admin user for uploadedBy
      const superAdminRole = await tx.select({ id: roles.id })
        .from(roles)
        .where(eq(roles.name, 'super_admin'))
        .limit(1);

      if (superAdminRole.length === 0) {
        throw new Error('No super_admin role found in database.');
      }

      const superAdminUser = await tx.select({ id: users.id })
        .from(users)
        .where(eq(users.roleId, superAdminRole[0].id))
        .limit(1);

      if (superAdminUser.length === 0) {
        throw new Error('No user with super_admin role found in database.');
      }

      const systemUserId = superAdminUser[0].id;
      console.log(`   Using Super Admin user: ${systemUserId}`);

      // Insert the native form
      const schemaJson = JSON.stringify(nativeSchema);
      const [row] = await tx.insert(questionnaireForms).values({
        id: uuidv7(),
        formId: parsed.settings.form_id,
        version: nativeSchema.version,
        title: parsed.settings.form_title,
        status: 'draft',
        isNative: true,
        formSchema: nativeSchema,
        fileHash: `native:migration:${parsed.settings.form_id}`,
        fileName: `${parsed.settings.form_title}.json`,
        fileSize: schemaJson.length,
        mimeType: 'application/json',
        uploadedBy: systemUserId,
      }).returning();

      return row;
    });

    console.log(`   ✅ Created form: ${created.id}`);
    console.log(`   Form ID: ${created.formId}`);
    console.log(`   Version: ${created.version}`);
    console.log(`   Status: ${created.status}`);

    await pool.end();
  } catch (err) {
    console.error('❌ Database operation failed:', (err as Error).message);
    await pool.end();
    process.exit(1);
  }

  // Summary
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log(`║  Migration complete: ${summary.sectionCount} sections, ${summary.questionCount} questions,`);
  console.log(`║  ${summary.choiceListCount} choice lists, ${summary.skipLogicCount} skip logic conditions`);
  console.log('╚══════════════════════════════════════════════════════════╝');

  // Note about age calculate field
  console.log('\n📝 Note: grp_labor showWhen references \'age\' (calculate field).');
  console.log('   Form renderer must compute age from dob at runtime (Epic 3).');
}

main().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
