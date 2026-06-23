/**
 * _termii-test.ts — standalone Termii connectivity probe (pre-9-27-Part-B SMS go-live).
 *
 * OSLRS has NO Termii adapter yet (sms-provider.adapter.ts = NoopSmsProvider only), so
 * this talks to Termii's REST API directly. Purpose: let the operator verify a FRESH
 * Termii account (10 NGN welcome bonus, NO KYC uploaded) works BEFORE investing in the
 * (multi-day) sender-ID approval.
 *
 * Run (PowerShell, in-session via the `!` prefix):
 *   $env:TERMII_API_KEY="TLxxxxxxxx"; pnpm --filter @oslsr/api exec tsx scripts/_termii-test.ts
 *       → DRY RUN: checks balance + lists sender IDs. Spends nothing. Proves the key + account.
 *   $env:TERMII_API_KEY="TLxxxxxxxx"; pnpm --filter @oslsr/api exec tsx scripts/_termii-test.ts --send --to 2348012345678
 *       → sends ONE real test SMS (~1 unit of the bonus). Use YOUR OWN registered phone (best pre-KYC bet).
 *   optional: --from "Termii"   (sender override; default below)   --channel dnd|generic
 *
 * Nothing is committed/wired into the app — pure operator diagnostic. Exit 0 = key + balance OK.
 *
 * Key handling: reads TERMII_API_KEY from the gitignored root `.env` (preferred — keeps the
 * secret out of your shell history / this transcript) OR from an exported env var.
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Load the root .env (apps/api/scripts → ../../../.env) so TERMII_API_KEY can live there.
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });

// Default to the v3 host; override with TERMII_BASE_URL if your account uses a different region host.
const API_BASE = process.env.TERMII_BASE_URL?.trim() || 'https://v3.api.termii.com';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const hasFlag = (name: string): boolean => process.argv.includes(`--${name}`);

interface BalanceResp { user?: string; balance?: number; currency?: string; message?: string }
interface SenderRow { sender_id?: string; status?: string; usecase?: string; company?: string }
// v3 nests sender IDs under `content`; the legacy .ng host used `data`. Support both.
interface SenderIdResp { content?: SenderRow[]; data?: SenderRow[]; message?: string }
interface SendResp { message_id?: string; message?: string; code?: string; balance?: number }

async function getJson<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; body: T }> {
  const res = await fetch(url, init);
  let body = {} as T;
  try {
    body = (await res.json()) as T;
  } catch {
    /* non-JSON response — leave body empty */
  }
  return { ok: res.ok, status: res.status, body };
}

async function main(): Promise<void> {
  const apiKey = process.env.TERMII_API_KEY?.trim();
  if (!apiKey) {
    console.error('\n❌ Set your key first:  $env:TERMII_API_KEY="TL..."   (find it in Termii dashboard → Settings → API)');
    process.exit(1);
  }
  const to = arg('to');
  const from = arg('from') ?? 'Termii'; // shared default sender that works for pre-KYC test sends
  const channel = arg('channel') ?? 'generic';
  const doSend = hasFlag('send');

  // 1/3 — Balance: proves the API key works + shows the welcome bonus. Costs nothing.
  console.log('\n🔎 1/3  Checking Termii balance...');
  const bal = await getJson<BalanceResp>(`${API_BASE}/api/get-balance?api_key=${encodeURIComponent(apiKey)}`);
  if (!bal.ok) {
    console.error(`   ❌ Balance check failed (HTTP ${bal.status}): ${JSON.stringify(bal.body)}`);
    console.error('      → A 4xx here usually means a wrong/expired API key.');
    process.exit(2);
  }
  console.log(`   ✅ Account live. Balance: ${bal.body.balance ?? '?'} ${bal.body.currency ?? ''}  (user: ${bal.body.user ?? 'n/a'})`);

  // 2/3 — Sender IDs: what you can send "from". Pre-KYC this is usually empty/pending.
  console.log('\n🔎 2/3  Listing registered sender IDs...');
  const sid = await getJson<SenderIdResp>(`${API_BASE}/api/sender-id?api_key=${encodeURIComponent(apiKey)}`);
  const senders = sid.body.content ?? (Array.isArray(sid.body.data) ? sid.body.data : []);
  if (senders.length === 0) {
    console.log('   ⚠️  No sender IDs registered. You must register one AND get it approved (KYC) before ANY send works.');
  } else {
    for (const s of senders) {
      const st = (s.status ?? '').toLowerCase();
      const approved = st === 'active' || st === 'approved';
      console.log(`   • ${s.sender_id}  status=${s.status}${approved ? ' ✅ usable' : ' ⏳ NOT usable until approved'}  usecase="${s.usecase ?? '-'}"`);
    }
    if (!senders.some((s) => { const st = (s.status ?? '').toLowerCase(); return st === 'active' || st === 'approved'; })) {
      console.log('   ⚠️  None are approved yet → every send will 404 "ApplicationSenderId not found" until one is approved.');
    }
  }

  // 3/3 — Send (guarded behind --send so a dry-run never spends the bonus).
  if (!doSend) {
    console.log('\n🟡 3/3  DRY RUN — not sending. Your key + balance are confirmed above (that alone proves the account is live).');
    console.log('        To dispatch a real test SMS:  ...scripts/_termii-test.ts --send --to <your-phone, e.g. 2348012345678>');
    return;
  }
  if (!to) {
    console.error('\n❌ --send needs --to <phone> in international format (e.g. 2348012345678, no + or spaces).');
    process.exit(3);
  }

  const stamp = new Date().toISOString().slice(11, 19);
  console.log(`\n🔎 3/3  Sending a test SMS to ${to} from "${from}" (channel=${channel})...`);
  const send = await getJson<SendResp>(`${API_BASE}/api/sms/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to,
      from,
      sms: `OSLRS Termii test ${stamp} — if you received this, SMS works.`,
      type: 'plain',
      channel,
      api_key: apiKey,
    }),
  });
  if (!send.ok) {
    console.error(`   ❌ Send rejected (HTTP ${send.status}): ${JSON.stringify(send.body)}`);
    console.error('      Common pre-KYC causes:');
    console.error('        • sender ID not approved → retry with  --from "Termii"  or  --channel dnd');
    console.error('        • destination not whitelisted → send to the exact phone you registered the account with');
    process.exit(4);
  }
  console.log(`   ✅ Termii accepted it. message_id=${send.body.message_id ?? '(see response)'}  remaining balance=${send.body.balance ?? '?'}`);
  console.log('   👉 Now check the phone. Delivery can lag a few seconds.');
}

main().catch((err: unknown) => {
  console.error('\n❌ Unexpected error:', err instanceof Error ? err.message : String(err));
  process.exit(5);
});
