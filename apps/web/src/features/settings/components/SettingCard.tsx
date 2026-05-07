/**
 * SettingCard — shared card layout for the Settings landing page.
 *
 * Two variants:
 *   - "control"  → renders an inline control (e.g. SmsOtpToggle)
 *   - "link"     → renders an arrow-cued navigation card linking to an
 *                   existing settings-shaped surface (e.g. Fraud Thresholds,
 *                   MFA Settings)
 *
 * Layout: icon (left) + title + description (center) + control or chevron
 * (right). Audit metadata ("Last changed by ... on ...") rendered below the
 * description when supplied.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { ChevronRight } from 'lucide-react';

interface BaseProps {
  icon: LucideIcon;
  title: string;
  description: string;
  testId?: string;
}

interface ControlVariantProps extends BaseProps {
  variant: 'control';
  control: ReactNode;
  audit?: { updatedBy: string; updatedAt: string };
}

interface LinkVariantProps extends BaseProps {
  variant: 'link';
  href: string;
}

export type SettingCardProps = ControlVariantProps | LinkVariantProps;

export function SettingCard(props: SettingCardProps) {
  const Icon = props.icon;

  const inner = (
    <div
      className="flex items-start gap-4 rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition hover:border-gray-300"
      data-testid={props.testId}
    >
      <div className="mt-1 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100">
        <Icon className="h-5 w-5 text-gray-600" />
      </div>
      <div className="flex-1">
        <h2 className="text-base font-semibold text-gray-900">{props.title}</h2>
        <p className="mt-0.5 text-sm text-gray-600">{props.description}</p>
        {props.variant === 'control' && props.audit && (
          <p className="mt-2 text-xs text-gray-500">
            Last changed by {props.audit.updatedBy} on{' '}
            {new Date(props.audit.updatedAt).toLocaleString()}
          </p>
        )}
      </div>
      {props.variant === 'control' ? (
        <div className="flex-shrink-0">{props.control}</div>
      ) : (
        <ChevronRight className="mt-2 h-5 w-5 flex-shrink-0 text-gray-400" />
      )}
    </div>
  );

  if (props.variant === 'link') {
    return (
      <Link to={props.href} className="block focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 rounded-lg">
        {inner}
      </Link>
    );
  }

  return inner;
}
