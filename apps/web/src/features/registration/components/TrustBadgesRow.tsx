import { Lock, Gift } from 'lucide-react';
import { cn } from '../../../lib/utils';

/**
 * Story 9-12 AC#8 — Trust badges row.
 *
 * Three `<aside role="note">` chips rendered at the foot of every wizard
 * step card. Visual hierarchy is INTENTIONALLY lower than primary CTAs —
 * neutral chrome, not a pull-quote.
 *
 *   1. 🔒 Secure Registration                — Success-100 bg / 600 fg
 *   2. 🛡️ Official Oyo State Platform         — Primary-50 bg / 600 fg + coat-of-arms logo
 *   3. 🆓 Free to Join                        — Info-100 bg / 600 fg
 *
 * Layout: row on screens ≥ 480px, stack on screens < 480px.
 *
 * Each badge has an `aria-label` describing the assurance.
 */

export interface TrustBadgesRowProps {
  className?: string;
}

export function TrustBadgesRow({ className }: TrustBadgesRowProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center',
        className,
      )}
      data-testid="trust-badges-row"
    >
      <Badge
        icon={<Lock className="h-4 w-4 text-success-600" aria-hidden="true" />}
        label="Secure Registration"
        ariaLabel="Secure registration — data transmitted over encrypted HTTPS"
        bgClass="bg-success-100"
        textClass="text-success-700"
        testId="trust-badge-secure"
      />
      <Badge
        icon={
          <img
            src="/images/oyo-coat-of-arms.png"
            alt=""
            aria-hidden="true"
            className="h-5 w-5 object-contain"
          />
        }
        label="Official Oyo State Platform"
        ariaLabel="Official Oyo State Government platform"
        bgClass="bg-primary-50"
        textClass="text-primary-700"
        testId="trust-badge-official"
      />
      <Badge
        icon={<Gift className="h-4 w-4 text-info-600" aria-hidden="true" />}
        label="Free to Join"
        ariaLabel="Free to join — no registration fee"
        bgClass="bg-info-100"
        textClass="text-info-700"
        testId="trust-badge-free"
      />
    </div>
  );
}

function Badge({
  icon,
  label,
  ariaLabel,
  bgClass,
  textClass,
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  ariaLabel: string;
  bgClass: string;
  textClass: string;
  testId: string;
}) {
  return (
    <aside
      role="note"
      aria-label={ariaLabel}
      data-testid={testId}
      className={cn(
        'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium',
        bgClass,
        textClass,
      )}
    >
      {icon}
      <span>{label}</span>
    </aside>
  );
}
