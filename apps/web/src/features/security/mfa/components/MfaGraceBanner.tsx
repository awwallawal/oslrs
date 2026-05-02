import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';

/**
 * Story 9-13 AC#5c — persistent dashboard banner shown to super_admin users
 * during the MFA enrollment grace period. Counts down to `mfa_grace_until` and
 * is dismissible only by completing enrollment.
 */
interface MfaGraceBannerProps {
  graceUntil: string | Date;
  enrollmentPath?: string;
}

function formatRemaining(graceUntil: Date): { label: string; expired: boolean } {
  const ms = graceUntil.getTime() - Date.now();
  if (ms <= 0) return { label: 'expired', expired: true };
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (days > 0) return { label: `${days}d ${hours}h`, expired: false };
  if (hours > 0) return { label: `${hours}h ${minutes}m`, expired: false };
  return { label: `${minutes}m`, expired: false };
}

export function MfaGraceBanner({
  graceUntil,
  enrollmentPath = '/dashboard/super-admin/security/mfa',
}: MfaGraceBannerProps) {
  const deadline = typeof graceUntil === 'string' ? new Date(graceUntil) : graceUntil;
  const [tick, setTick] = useState(0);

  // Refresh once per minute to keep the countdown live without overhead.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const { label, expired } = formatRemaining(deadline);
  // tick is read so React re-renders; ESLint exhaustive-deps would otherwise complain.
  void tick;

  return (
    <div
      role="alert"
      className={`border-l-4 px-4 py-3 mb-4 text-sm rounded ${
        expired
          ? 'border-red-600 bg-red-50 text-red-900'
          : 'border-amber-500 bg-amber-50 text-amber-900'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <strong>MFA enrollment required.</strong>{' '}
          {expired ? (
            <>The grace period has expired. Login is restricted until you enrol.</>
          ) : (
            <>You have <strong>{label}</strong> left to enrol in TOTP MFA.</>
          )}
        </div>
        <Link
          to={enrollmentPath}
          className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded text-sm font-medium whitespace-nowrap"
        >
          Enrol now
        </Link>
      </div>
    </div>
  );
}
