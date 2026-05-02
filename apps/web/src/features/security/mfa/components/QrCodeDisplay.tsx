/**
 * QR code + manual-entry fallback for the enrollment wizard (Story 9-13 AC#9 step 1).
 * Shown after `POST /auth/mfa/enroll` succeeds. The QR is a data: URI rendered
 * server-side via `qrcode` npm so we never ship the secret to the client more
 * than once.
 */
interface QrCodeDisplayProps {
  qrCodeDataUri: string;
  secret: string;
  email: string;
}

export function QrCodeDisplay({ qrCodeDataUri, secret, email }: QrCodeDisplayProps) {
  const groupedSecret = secret.match(/.{1,4}/g)?.join(' ') ?? secret;

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-700">
        Scan this QR code with Google Authenticator, Authy, 1Password, Bitwarden,
        or any TOTP-compatible authenticator app. Make sure the account label
        reads <strong>OSLRS:{email}</strong> after scanning.
      </p>

      <div className="flex justify-center bg-white p-4 border rounded-md">
        <img
          src={qrCodeDataUri}
          alt="MFA QR code"
          width={256}
          height={256}
          className="block"
        />
      </div>

      <details className="text-sm text-gray-700 border rounded-md p-3">
        <summary className="cursor-pointer font-medium">
          Can&rsquo;t scan? Enter this secret manually
        </summary>
        <p className="mt-2 mb-1 text-gray-600">
          Open your authenticator app and choose &ldquo;Enter setup key&rdquo;.
          Copy this secret exactly (case-insensitive):
        </p>
        <code className="block break-all bg-gray-100 px-3 py-2 rounded font-mono text-base tracking-wide">
          {groupedSecret}
        </code>
      </details>
    </div>
  );
}
