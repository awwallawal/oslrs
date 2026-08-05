/**
 * Who can we NOT email? — the SMS / phone-call list.
 *
 * Reads the same three sources as `resolveRespondentContactEmail`, so this list and every email
 * flow agree by construction. A person here is not un-contactable; they are un-EMAILABLE, and
 * outreach has to go by phone.
 *
 * WHY IT MATTERS BEYOND OUTREACH. Any flow that clears or invalidates something and then asks
 * the person to replace it — `nin:reconfirm` is the live example — must SKIP these people. The
 * clear-then-ask pattern is only honest if the asking can happen; performing the clear against
 * someone you cannot reach leaves them strictly worse off than before you touched the record.
 *
 *   pnpm --filter @oslsr/api sms:outreach-list
 *
 * Read-only. Prints a table an operator can work from directly.
 */
import { listRespondentsWithoutEmail } from '../src/services/respondent-contact.service.js';

async function main(): Promise<void> {
  const rows = await listRespondentsWithoutEmail();

  console.log('');
  console.log('='.repeat(78));
  console.log(`SMS / phone outreach list — ${rows.length} respondent(s) with NO email anywhere`);
  console.log('='.repeat(78));

  if (rows.length === 0) {
    console.log('  Everyone on file is reachable by email.');
    return;
  }

  console.log('  reference        phone            status                name');
  console.log('  ' + '-'.repeat(74));
  for (const r of rows) {
    console.log(
      `  ${(r.referenceCode ?? '(none)').padEnd(16)} ${(r.phoneNumber ?? '(none)').padEnd(16)} ` +
        `${r.status.padEnd(21)} ${r.name || '(no name on file)'}`,
    );
  }

  const noPhone = rows.filter((r) => !r.phoneNumber).length;
  console.log('');
  if (noPhone > 0) {
    console.log(`  ⚠️ ${noPhone} of these have NO PHONE EITHER — they cannot be reached at all.`);
    console.log('     Nothing that depends on contacting them should be started against them.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('failed to build the outreach list:', err);
    process.exit(1);
  });
