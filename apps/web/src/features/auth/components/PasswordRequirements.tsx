import { CheckCircle, Circle, Info } from 'lucide-react';

interface PasswordRequirement {
  label: string;
  met: boolean;
}

interface PasswordRequirementsProps {
  password: string;
  showAlways?: boolean;
  className?: string;
}

/**
 * Password Requirements Component
 *
 * Shows password complexity requirements with real-time validation feedback.
 * Can be configured to show always or only when user starts typing.
 */
export function PasswordRequirements({
  password,
  showAlways = true,
  className = '',
}: PasswordRequirementsProps) {
  const requirements: PasswordRequirement[] = [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'One uppercase letter (A-Z)', met: /[A-Z]/.test(password) },
    { label: 'One lowercase letter (a-z)', met: /[a-z]/.test(password) },
    { label: 'One number (0-9)', met: /[0-9]/.test(password) },
    { label: 'One special character (!@#$%^&*)', met: /[^A-Za-z0-9]/.test(password) },
  ];

  const metCount = requirements.filter((r) => r.met).length;
  const allMet = metCount === requirements.length;
  const hasStartedTyping = password.length > 0;

  // Don't show if not showAlways and user hasn't typed
  if (!showAlways && !hasStartedTyping) {
    return null;
  }

  return (
    <div
      className={`rounded-lg border ${
        hasStartedTyping
          ? allMet
            ? 'bg-success-50 border-success-200'
            : 'bg-neutral-50 border-neutral-200'
          : 'bg-primary-50 border-primary-200'
      } ${className}`}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-inherit">
        <div className="flex items-center gap-2">
          <Info className={`w-4 h-4 ${hasStartedTyping ? (allMet ? 'text-success-600' : 'text-neutral-500') : 'text-primary-600'}`} />
          <span className={`text-sm font-medium ${hasStartedTyping ? (allMet ? 'text-success-700' : 'text-neutral-700') : 'text-primary-700'}`}>
            Password Requirements
          </span>
          {hasStartedTyping && (
            <span className={`ml-auto text-xs ${allMet ? 'text-success-600' : 'text-neutral-500'}`}>
              {metCount}/{requirements.length}
            </span>
          )}
        </div>
      </div>

      {/* Requirements List */}
      <div className="px-3 py-2">
        <ul className="space-y-1.5">
          {requirements.map((req, index) => (
            <li
              key={index}
              className={`text-sm flex items-center gap-2 transition-colors ${
                hasStartedTyping
                  ? req.met
                    ? 'text-success-600'
                    : 'text-neutral-500'
                  : 'text-primary-700'
              }`}
            >
              {hasStartedTyping ? (
                req.met ? (
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />
                ) : (
                  <Circle className="w-4 h-4 flex-shrink-0" />
                )
              ) : (
                <Circle className="w-4 h-4 flex-shrink-0 text-primary-400" />
              )}
              {req.label}
            </li>
          ))}
        </ul>

        {/* Example - only show before typing */}
        {!hasStartedTyping && (
          <div className="mt-3 pt-2 border-t border-primary-200">
            <p className="text-xs text-primary-600">
              <span className="font-medium">Example:</span>{' '}
              <code className="bg-primary-100 px-1.5 py-0.5 rounded text-primary-700">
                MySecure@123
              </code>
            </p>
          </div>
        )}

        {/* Success message when all requirements met */}
        {hasStartedTyping && allMet && (
          <div className="mt-2 pt-2 border-t border-success-200">
            <p className="text-xs text-success-600 font-medium flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5" />
              Strong password - all requirements met!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Compact version for inline use
 */
export function PasswordStrengthIndicator({ password }: { password: string }) {
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[a-z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];

  const strength = checks.filter(Boolean).length;

  if (password.length === 0) return null;

  const getStrengthLabel = () => {
    if (strength <= 2) return { label: 'Weak', color: 'text-error-600', bg: 'bg-error-500' };
    if (strength <= 3) return { label: 'Fair', color: 'text-warning-600', bg: 'bg-warning-500' };
    if (strength <= 4) return { label: 'Good', color: 'text-primary-600', bg: 'bg-primary-500' };
    return { label: 'Strong', color: 'text-success-600', bg: 'bg-success-500' };
  };

  const { label, color, bg } = getStrengthLabel();

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-xs font-medium ${color}`}>{label}</span>
      </div>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((level) => (
          <div
            key={level}
            className={`h-1 flex-1 rounded-full transition-colors ${
              level <= strength ? bg : 'bg-neutral-200'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
