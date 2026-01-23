import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

/**
 * VerificationCodeInput - Input and submit for worker verification code.
 *
 * Expects format: OSLSR-XXXX-XXXX or just the code portion.
 * On submit, navigates to /verify-staff/{code}.
 */
function VerificationCodeInput() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmedCode = code.trim();

    if (!trimmedCode) {
      setError('Please enter a verification code');
      return;
    }

    // Clear any previous error
    setError('');

    // Navigate to the verification page
    navigate(`/verify-staff/${trimmedCode}`);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label htmlFor="verification-code" className="block text-sm font-medium text-neutral-700 mb-2">
          Enter Verification Code
        </label>
        <input
          type="text"
          id="verification-code"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            if (error) setError('');
          }}
          placeholder="e.g., OSLSR-ABCD-1234"
          className="w-full px-4 py-3 rounded-lg border border-neutral-300 bg-white text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
          aria-describedby={error ? 'verification-error' : 'verification-help'}
        />
        {error ? (
          <p id="verification-error" className="mt-1 text-sm text-error-600">
            {error}
          </p>
        ) : (
          <p id="verification-help" className="mt-1 text-sm text-neutral-500">
            The verification code is found on the worker's ID card or profile
          </p>
        )}
      </div>
      <button
        type="submit"
        className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-colors"
      >
        Verify
        <ArrowRight className="w-4 h-4" />
      </button>
    </form>
  );
}

export { VerificationCodeInput };
