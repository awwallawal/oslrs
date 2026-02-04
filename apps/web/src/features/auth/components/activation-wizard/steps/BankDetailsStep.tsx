import { useState, useMemo } from 'react';
import { cn } from '../../../../../lib/utils';
import type { StepRenderProps } from '../ActivationWizard';

/**
 * Comprehensive Nigerian banks list organized by category
 * Source: CBN Licensed Financial Institutions (2024)
 */
const BANK_CATEGORIES = {
  'Commercial Banks': [
    'Access Bank Plc',
    'Citibank Nigeria Ltd',
    'Ecobank Nigeria Plc',
    'Fidelity Bank Plc',
    'First Bank of Nigeria Ltd',
    'First City Monument Bank (FCMB) Plc',
    'Globus Bank Ltd',
    'Guaranty Trust Bank (GTBank) Plc',
    'Keystone Bank Ltd',
    'Polaris Bank Ltd',
    'Premium Trust Bank Ltd',
    'Providus Bank Ltd',
    'Stanbic IBTC Bank Plc',
    'Standard Chartered Bank Nigeria Ltd',
    'Sterling Bank Plc',
    'SunTrust Bank Nigeria Ltd',
    'Titan Trust Bank Ltd',
    'Union Bank of Nigeria Plc',
    'United Bank for Africa (UBA) Plc',
    'Unity Bank Plc',
    'Wema Bank Plc',
    'Zenith Bank Plc',
    'Optimus Bank Ltd',
    'Parallex Bank Ltd',
    'Signature Bank Ltd',
  ],
  'Non-Interest (Islamic) Banks': [
    'Jaiz Bank Plc',
    'TAJBank Ltd',
    'Lotus Bank Ltd',
    'Alternative Bank Ltd',
  ],
  'Digital & Microfinance Banks': [
    'Kuda Microfinance Bank',
    'OPay (OPay MFB)',
    'PalmPay (PalmPay MFB)',
    'Moniepoint MFB',
    'Carbon MFB',
    'FairMoney MFB',
    'Renmoney MFB',
    'Sparkle MFB',
    'VFD Microfinance Bank',
    'ALAT by Wema',
    'Rubies Bank',
    'Eyowo MFB',
    'LAPO Microfinance Bank',
    'Accion Microfinance Bank',
    'AB Microfinance Bank',
    'NPF Microfinance Bank',
    'Grooming Microfinance Bank',
    'Baobab Microfinance Bank',
    'FCMB Microfinance Bank',
    'Mutual Trust Microfinance Bank',
    'Fina Trust Microfinance Bank',
    'Page Microfinance Bank',
    'Nirsal Microfinance Bank',
    'Mainstreet Microfinance Bank',
    'Seed Capital Microfinance Bank',
    'Fortis Microfinance Bank',
    'Infinity Microfinance Bank',
    'Trustfund Microfinance Bank',
    'Peace Microfinance Bank',
  ],
  'Payment Service Banks': [
    'MoMo Payment Service Bank (MTN)',
    '9 Payment Service Bank (9PSB)',
    'Hope Payment Service Bank',
    'Money Master PSB',
    'Smartcash PSB (Airtel)',
  ],
} as const;

// Flatten all banks for search - typed as string[] for includes() compatibility
const ALL_BANKS: readonly string[] = Object.values(BANK_CATEGORIES).flat();

// Special value for "Other" option
const OTHER_BANK_VALUE = '__OTHER__';

/**
 * Step 3: Bank Details
 *
 * Collects bank information for salary payments.
 * Account number must be exactly 10 digits.
 * Includes comprehensive list of Nigerian banks with "Other" option.
 */
export function BankDetailsStep({
  formData,
  updateFormData,
  errors,
  isSubmitting,
}: StepRenderProps) {
  // Track if user selected "Other" option
  const [isOtherBank, setIsOtherBank] = useState(() => {
    // Check if current value is not in the list (meaning it's a custom entry)
    return formData.bankName !== '' && !ALL_BANKS.includes(formData.bankName);
  });

  // Search/filter state for the dropdown
  const [searchTerm, setSearchTerm] = useState('');

  // Filter banks based on search term
  const filteredCategories = useMemo((): Record<string, readonly string[]> => {
    if (!searchTerm.trim()) return BANK_CATEGORIES;

    const term = searchTerm.toLowerCase();
    const filtered: Record<string, string[]> = {};

    for (const [category, banks] of Object.entries(BANK_CATEGORIES)) {
      const matchingBanks = banks.filter((bank: string) =>
        bank.toLowerCase().includes(term)
      );
      if (matchingBanks.length > 0) {
        filtered[category] = matchingBanks;
      }
    }

    return filtered;
  }, [searchTerm]);

  const handleBankSelect = (value: string) => {
    if (value === OTHER_BANK_VALUE) {
      setIsOtherBank(true);
      updateFormData({ bankName: '' }); // Clear so user can type
    } else {
      setIsOtherBank(false);
      updateFormData({ bankName: value });
    }
    setSearchTerm('');
  };

  const handleCustomBankChange = (value: string) => {
    updateFormData({ bankName: value });
  };

  return (
    <div className="space-y-5">
      {/* Step Description */}
      <div className="text-center mb-6">
        <h2 className="text-lg font-semibold text-neutral-900">
          Bank Details
        </h2>
        <p className="mt-1 text-sm text-neutral-600">
          Provide your bank account information for salary payments.
        </p>
      </div>

      {/* Bank Name Field */}
      <div className="space-y-1.5">
        <label
          htmlFor="bankName"
          className="block text-sm font-medium text-neutral-700"
        >
          Bank Name <span className="text-error-500">*</span>
        </label>

        {!isOtherBank ? (
          <>
            {/* Search input for filtering */}
            <input
              type="text"
              placeholder="Type to search banks..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              disabled={isSubmitting}
              className={cn(
                'w-full px-4 py-2 rounded-t-lg border-x border-t transition-colors text-sm',
                'focus:outline-none focus-visible:ring-2',
                'disabled:bg-neutral-100 disabled:cursor-not-allowed',
                'border-neutral-300 focus-visible:ring-primary-500'
              )}
              aria-label="Search banks"
            />
            {/* Bank dropdown with categories */}
            <select
              id="bankName"
              value={formData.bankName}
              onChange={(e) => handleBankSelect(e.target.value)}
              disabled={isSubmitting}
              size={8}
              className={cn(
                'w-full px-4 py-2 rounded-b-lg border transition-colors',
                'focus:outline-none focus-visible:ring-2',
                'disabled:bg-neutral-100 disabled:cursor-not-allowed',
                'bg-white',
                errors.bankName
                  ? 'border-error-600 focus-visible:ring-error-600 focus:border-error-600'
                  : 'border-neutral-300 focus-visible:ring-primary-500 focus:border-primary-500'
              )}
              aria-invalid={!!errors.bankName}
              aria-describedby={errors.bankName ? 'bankName-error' : 'bankName-hint'}
            >
              <option value="" disabled>
                -- Select your bank --
              </option>
              {Object.entries(filteredCategories).map(([category, banks]) => (
                <optgroup key={category} label={category}>
                  {banks.map((bank) => (
                    <option key={bank} value={bank}>
                      {bank}
                    </option>
                  ))}
                </optgroup>
              ))}
              <optgroup label="Other">
                <option value={OTHER_BANK_VALUE}>
                  Other (type bank name)
                </option>
              </optgroup>
            </select>
          </>
        ) : (
          <>
            {/* Custom bank name input */}
            <input
              id="bankName"
              type="text"
              value={formData.bankName}
              onChange={(e) => handleCustomBankChange(e.target.value)}
              disabled={isSubmitting}
              placeholder="Enter your bank name"
              className={cn(
                'w-full px-4 py-3 rounded-lg border transition-colors',
                'focus:outline-none focus-visible:ring-2',
                'disabled:bg-neutral-100 disabled:cursor-not-allowed',
                errors.bankName
                  ? 'border-error-600 focus-visible:ring-error-600 focus:border-error-600'
                  : 'border-neutral-300 focus-visible:ring-primary-500 focus:border-primary-500'
              )}
              aria-invalid={!!errors.bankName}
              aria-describedby={errors.bankName ? 'bankName-error' : 'bankName-hint'}
            />
            <button
              type="button"
              onClick={() => {
                setIsOtherBank(false);
                updateFormData({ bankName: '' });
              }}
              disabled={isSubmitting}
              className="text-sm text-primary-600 hover:text-primary-700 underline mt-1"
            >
              Back to bank list
            </button>
          </>
        )}

        {errors.bankName ? (
          <p id="bankName-error" className="text-error-600 text-sm">
            {errors.bankName}
          </p>
        ) : (
          <p id="bankName-hint" className="text-neutral-500 text-xs">
            {isOtherBank
              ? 'Type your bank name if not listed above'
              : `${ALL_BANKS.length} banks available. Can't find yours? Select "Other" at the bottom.`}
          </p>
        )}
      </div>

      {/* Account Number Field */}
      <div className="space-y-1.5">
        <label
          htmlFor="accountNumber"
          className="block text-sm font-medium text-neutral-700"
        >
          Account Number <span className="text-error-500">*</span>
        </label>
        <input
          id="accountNumber"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={10}
          autoComplete="off"
          value={formData.accountNumber}
          onChange={(e) => {
            // Only allow digits
            const value = e.target.value.replace(/\D/g, '');
            updateFormData({ accountNumber: value });
          }}
          disabled={isSubmitting}
          className={cn(
            'w-full px-4 py-3 rounded-lg border transition-colors',
            'focus:outline-none focus-visible:ring-2',
            'disabled:bg-neutral-100 disabled:cursor-not-allowed',
            errors.accountNumber
              ? 'border-error-600 focus-visible:ring-error-600 focus:border-error-600'
              : 'border-neutral-300 focus-visible:ring-primary-500 focus:border-primary-500'
          )}
          placeholder="Enter 10-digit account number"
          aria-invalid={!!errors.accountNumber}
          aria-describedby={errors.accountNumber ? 'accountNumber-error' : 'accountNumber-hint'}
        />
        {errors.accountNumber ? (
          <p id="accountNumber-error" className="text-error-600 text-sm">
            {errors.accountNumber}
          </p>
        ) : (
          <p id="accountNumber-hint" className="text-neutral-500 text-xs">
            Your 10-digit bank account number
          </p>
        )}
        {/* Character count indicator */}
        <div className="text-right">
          <span
            className={cn(
              'text-xs',
              formData.accountNumber.length === 10 ? 'text-success-600' : 'text-neutral-400'
            )}
          >
            {formData.accountNumber.length}/10 digits
          </span>
        </div>
      </div>

      {/* Account Name Field */}
      <div className="space-y-1.5">
        <label
          htmlFor="accountName"
          className="block text-sm font-medium text-neutral-700"
        >
          Account Name <span className="text-error-500">*</span>
        </label>
        <input
          id="accountName"
          type="text"
          autoComplete="name"
          value={formData.accountName}
          onChange={(e) => updateFormData({ accountName: e.target.value })}
          disabled={isSubmitting}
          className={cn(
            'w-full px-4 py-3 rounded-lg border transition-colors',
            'focus:outline-none focus-visible:ring-2',
            'disabled:bg-neutral-100 disabled:cursor-not-allowed',
            errors.accountName
              ? 'border-error-600 focus-visible:ring-error-600 focus:border-error-600'
              : 'border-neutral-300 focus-visible:ring-primary-500 focus:border-primary-500'
          )}
          placeholder="Enter account holder name"
          aria-invalid={!!errors.accountName}
          aria-describedby={errors.accountName ? 'accountName-error' : 'accountName-hint'}
        />
        {errors.accountName ? (
          <p id="accountName-error" className="text-error-600 text-sm">
            {errors.accountName}
          </p>
        ) : (
          <p id="accountName-hint" className="text-neutral-500 text-xs">
            Name as it appears on your bank account
          </p>
        )}
      </div>

      {/* Info note */}
      <div className="mt-4 p-3 bg-primary-50 border border-primary-200 rounded-lg">
        <p className="text-sm text-primary-700">
          Please ensure your bank details are correct. This information will be used for salary payments.
        </p>
      </div>
    </div>
  );
}
