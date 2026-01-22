import { useState, useEffect, useRef } from 'react';
import { X, Lock, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react';
import { useReAuth } from '../hooks/useReAuth';

interface ReAuthModalProps {
  /**
   * Whether the modal is open (controlled externally)
   * If not provided, uses internal state from useReAuth
   */
  isOpen?: boolean;
  /**
   * Callback when modal is closed
   */
  onClose?: () => void;
  /**
   * Callback when re-authentication succeeds
   */
  onSuccess?: () => void;
  /**
   * Description of the action requiring re-auth
   */
  actionDescription?: string;
}

/**
 * Re-Authentication Modal
 *
 * Shows a modal dialog for users to re-enter their password
 * when performing sensitive actions during Remember Me sessions.
 *
 * Can be used in controlled mode (with isOpen prop) or uncontrolled
 * mode (managed by the useReAuth hook context).
 */
export function ReAuthModal({
  isOpen: externalIsOpen,
  onClose,
  onSuccess,
  actionDescription: externalAction,
}: ReAuthModalProps) {
  const [showPassword, setShowPassword] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    password,
    error,
    isLoading,
    isOpen: internalIsOpen,
    pendingAction,
    setPassword,
    close,
    submit,
    reset,
  } = useReAuth();

  // Use external or internal state
  const isOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen;
  const actionDescription = externalAction || pendingAction || 'this action';

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      // Small delay to ensure modal animation completes
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Reset show password when modal closes
  useEffect(() => {
    if (!isOpen) {
      setShowPassword(false);
    }
  }, [isOpen]);

  // Handle close
  const handleClose = () => {
    if (isLoading) return;
    reset();
    onClose?.();
    close();
  };

  // Handle submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await submit();
    if (success) {
      onSuccess?.();
    }
  };

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isLoading) {
      handleClose();
    }
  };

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isLoading) {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, isLoading, handleClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="reauth-title"
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-warning-100 rounded-full flex items-center justify-center">
              <Lock className="w-5 h-5 text-warning-600" />
            </div>
            <h2 id="reauth-title" className="text-lg font-semibold text-neutral-900">
              Confirm Your Identity
            </h2>
          </div>
          <button
            onClick={handleClose}
            disabled={isLoading}
            className="text-neutral-400 hover:text-neutral-600 disabled:cursor-not-allowed"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          <p className="text-neutral-600 mb-4">
            For your security, please enter your password to continue with{' '}
            <span className="font-medium">{actionDescription}</span>.
          </p>

          {/* Error Alert */}
          {error && (
            <div className="mb-4 p-3 bg-error-100 border border-error-600/20 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-error-600 flex-shrink-0 mt-0.5" />
              <p className="text-error-600 text-sm">{error}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <div className="space-y-1.5 mb-4">
              <label
                htmlFor="reauth-password"
                className="block text-sm font-medium text-neutral-700"
              >
                Password
              </label>
              <div className="relative">
                <input
                  ref={inputRef}
                  id="reauth-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  className="w-full px-4 py-3 pr-12 rounded-lg border border-neutral-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-neutral-100 disabled:cursor-not-allowed transition-colors focus:outline-none"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isLoading}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-700 disabled:cursor-not-allowed"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleClose}
                disabled={isLoading}
                className="flex-1 py-3 px-4 rounded-lg font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 disabled:cursor-not-allowed transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading || !password}
                className={`
                  flex-1 py-3 px-4 rounded-lg font-semibold text-white transition-colors
                  flex items-center justify-center gap-2
                  ${isLoading || !password
                    ? 'bg-neutral-400 cursor-not-allowed'
                    : 'bg-primary-600 hover:bg-primary-700'
                  }
                `}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  'Confirm'
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-neutral-50 border-t border-neutral-200">
          <p className="text-xs text-neutral-500 text-center">
            This confirmation is required because you logged in with "Remember Me" enabled.
          </p>
        </div>
      </div>
    </div>
  );
}
