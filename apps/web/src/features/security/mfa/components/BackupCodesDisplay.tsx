import { useState } from 'react';

/**
 * Renders the 8 plaintext backup codes ONCE and gates the "Confirm enrollment"
 * action behind a "I have saved my backup codes" checkbox. Story 9-13 AC#9 step 4.
 *
 * Codes are NEVER stored anywhere by the client — the parent passes them as a
 * prop from the `/auth/mfa/enroll` response and the user is responsible for
 * recording them. Print and download buttons help, but offer no recovery if
 * they're lost; runbook §3.6 covers the 2nd-super_admin reset path.
 */
interface BackupCodesDisplayProps {
  codes: string[];
  onConfirm: () => void;
  confirmLabel?: string;
}

function formatPrintable(codes: string[]): string {
  const lines = [
    'OSLRS — MFA Backup Codes',
    '',
    'Store these codes somewhere safe (printed copy or password manager).',
    'Each code can be used ONCE in place of an authenticator code.',
    '',
    ...codes.map((c, i) => `${(i + 1).toString().padStart(2, '0')}. ${c}`),
    '',
    `Generated: ${new Date().toISOString()}`,
  ];
  return lines.join('\n');
}

export function BackupCodesDisplay({
  codes,
  onConfirm,
  confirmLabel = 'I have saved my backup codes — finish enrollment',
}: BackupCodesDisplayProps) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      // clipboard may be unavailable; user can still download/print
    }
  };

  const handleDownload = () => {
    const blob = new Blob([formatPrintable(codes)], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'oslrs-mfa-backup-codes.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    const safe = codes.map((c) => `<li><code>${c}</code></li>`).join('');
    w.document.write(`
      <html><head><title>OSLRS MFA Backup Codes</title>
      <style>body{font-family:system-ui,sans-serif;padding:24px;}h1{margin:0 0 16px;}ol{font-size:1.25rem;line-height:1.6;}code{font-family:monospace;}</style>
      </head><body>
      <h1>OSLRS — MFA Backup Codes</h1>
      <p>Each code can be used <strong>once</strong> in place of an authenticator code. Keep this page secure.</p>
      <ol>${safe}</ol>
      <p>Generated: ${new Date().toISOString()}</p>
      </body></html>
    `);
    w.document.close();
    w.print();
  };

  return (
    <div className="space-y-4">
      <div className="border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-900 rounded">
        <strong>Save these codes now.</strong> They will not be shown again. If
        you lose access to your authenticator and have no backup codes, account
        recovery requires the second super_admin to reset your MFA.
      </div>

      <div className="grid grid-cols-2 gap-2 bg-gray-50 border rounded-md p-4">
        {codes.map((code, i) => (
          <div key={i} className="flex items-center gap-2 font-mono text-base">
            <span className="text-gray-400 w-5 text-right">{i + 1}.</span>
            <span>{code}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleCopy}
          className="px-3 py-2 border rounded-md text-sm hover:bg-gray-50"
        >
          {copyState === 'copied' ? 'Copied!' : 'Copy all'}
        </button>
        <button
          type="button"
          onClick={handleDownload}
          className="px-3 py-2 border rounded-md text-sm hover:bg-gray-50"
        >
          Download .txt
        </button>
        <button
          type="button"
          onClick={handlePrint}
          className="px-3 py-2 border rounded-md text-sm hover:bg-gray-50"
        >
          Print
        </button>
      </div>

      <label className="flex items-start gap-2 mt-2">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          className="mt-1"
        />
        <span className="text-sm text-gray-700">
          I have saved my backup codes in a safe place (password manager, printed
          copy, or sealed envelope) and understand they cannot be retrieved later.
        </span>
      </label>

      <button
        type="button"
        onClick={onConfirm}
        disabled={!acknowledged}
        className="w-full bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium px-4 py-3 rounded-md"
      >
        {confirmLabel}
      </button>
    </div>
  );
}
