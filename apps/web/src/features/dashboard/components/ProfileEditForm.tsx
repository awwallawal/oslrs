/**
 * ProfileEditForm (Story 9.1, AC#3, AC#5)
 *
 * Inline edit form for editable profile fields with Zod validation.
 * Follows activation wizard field styling patterns.
 */

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { updateProfileSchema, type UpdateProfilePayload } from '@oslsr/types';
import { BANK_CATEGORIES, ALL_BANKS } from '../../../constants/nigerian-banks';
import { useState, useMemo } from 'react';
import { cn } from '../../../lib/utils';
import type { UserProfile } from '../api/profile.api';

interface ProfileEditFormProps {
  profile: UserProfile;
  onCancel: () => void;
  onSave: (data: UpdateProfilePayload) => void;
  isSaving: boolean;
}

const OTHER_BANK_VALUE = '__OTHER__';

export default function ProfileEditForm({ profile, onCancel, onSave, isSaving }: ProfileEditFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<UpdateProfilePayload>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      fullName: profile.fullName || '',
      phone: profile.phone || '',
      homeAddress: profile.homeAddress || '',
      nextOfKinName: profile.nextOfKinName || '',
      nextOfKinPhone: profile.nextOfKinPhone || '',
      bankName: profile.bankName || '',
      accountNumber: profile.accountNumber || '',
      accountName: profile.accountName || '',
    },
  });

  const bankNameValue = watch('bankName') ?? '';
  const accountNumberValue = watch('accountNumber') ?? '';

  const [isOtherBank, setIsOtherBank] = useState(() => {
    return bankNameValue !== '' && !ALL_BANKS.includes(bankNameValue);
  });
  const [searchTerm, setSearchTerm] = useState('');

  const filteredCategories = useMemo((): Record<string, readonly string[]> => {
    if (!searchTerm.trim()) return BANK_CATEGORIES;
    const term = searchTerm.toLowerCase();
    const filtered: Record<string, string[]> = {};
    for (const [category, banks] of Object.entries(BANK_CATEGORIES)) {
      const matchingBanks = banks.filter((bank: string) => bank.toLowerCase().includes(term));
      if (matchingBanks.length > 0) {
        filtered[category] = matchingBanks;
      }
    }
    return filtered;
  }, [searchTerm]);

  const inputClass = (hasError: boolean) =>
    cn(
      'w-full px-4 py-3 rounded-lg border transition-colors',
      'focus:outline-none focus-visible:ring-2',
      'disabled:bg-neutral-100 disabled:cursor-not-allowed',
      hasError
        ? 'border-error-600 focus-visible:ring-error-600'
        : 'border-neutral-300 focus-visible:ring-primary-500',
    );

  const onSubmit = (data: UpdateProfilePayload) => {
    // Only send changed fields
    const changed: Partial<UpdateProfilePayload> = {};
    const defaults: Record<string, string> = {
      fullName: profile.fullName || '',
      phone: profile.phone || '',
      homeAddress: profile.homeAddress || '',
      nextOfKinName: profile.nextOfKinName || '',
      nextOfKinPhone: profile.nextOfKinPhone || '',
      bankName: profile.bankName || '',
      accountNumber: profile.accountNumber || '',
      accountName: profile.accountName || '',
    };

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && value !== defaults[key]) {
        (changed as Record<string, string>)[key] = value as string;
      }
    }

    if (Object.keys(changed).length === 0) {
      onCancel();
      return;
    }

    onSave(changed);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-neutral-900">Edit Profile</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="px-4 py-2 text-sm font-medium text-neutral-700 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Personal Info */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide">Personal Information</h3>

        <div>
          <label htmlFor="fullName" className="block text-sm font-medium text-neutral-700">
            Full Name <span className="text-error-500">*</span>
          </label>
          <input
            id="fullName"
            type="text"
            {...register('fullName')}
            disabled={isSaving}
            className={inputClass(!!errors.fullName)}
          />
          {errors.fullName && <p className="mt-1 text-error-600 text-sm">{errors.fullName.message}</p>}
        </div>

        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-neutral-700">Phone</label>
          <input
            id="phone"
            type="text"
            inputMode="numeric"
            maxLength={11}
            {...register('phone')}
            disabled={isSaving}
            placeholder="08012345678"
            className={inputClass(!!errors.phone)}
          />
          {errors.phone ? (
            <p className="mt-1 text-error-600 text-sm">{errors.phone.message}</p>
          ) : (
            <p className="mt-1 text-neutral-500 text-xs">11-digit Nigerian phone number</p>
          )}
        </div>

        <div>
          <label htmlFor="homeAddress" className="block text-sm font-medium text-neutral-700">Home Address</label>
          <input
            id="homeAddress"
            type="text"
            {...register('homeAddress')}
            disabled={isSaving}
            className={inputClass(!!errors.homeAddress)}
          />
          {errors.homeAddress && <p className="mt-1 text-error-600 text-sm">{errors.homeAddress.message}</p>}
        </div>
      </div>

      {/* Next of Kin */}
      <div className="space-y-4 pt-4 border-t border-neutral-100">
        <h3 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide">Next of Kin</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="nextOfKinName" className="block text-sm font-medium text-neutral-700">Name</label>
            <input
              id="nextOfKinName"
              type="text"
              {...register('nextOfKinName')}
              disabled={isSaving}
              className={inputClass(!!errors.nextOfKinName)}
            />
            {errors.nextOfKinName && <p className="mt-1 text-error-600 text-sm">{errors.nextOfKinName.message}</p>}
          </div>

          <div>
            <label htmlFor="nextOfKinPhone" className="block text-sm font-medium text-neutral-700">Phone</label>
            <input
              id="nextOfKinPhone"
              type="text"
              inputMode="numeric"
              {...register('nextOfKinPhone')}
              disabled={isSaving}
              className={inputClass(!!errors.nextOfKinPhone)}
            />
            {errors.nextOfKinPhone && <p className="mt-1 text-error-600 text-sm">{errors.nextOfKinPhone.message}</p>}
          </div>
        </div>
      </div>

      {/* Bank Details */}
      <div className="space-y-4 pt-4 border-t border-neutral-100">
        <h3 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide">Bank Details</h3>

        <div>
          <label htmlFor="bankName" className="block text-sm font-medium text-neutral-700">Bank Name</label>
          {!isOtherBank ? (
            <>
              <input
                type="text"
                placeholder="Type to search banks..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                disabled={isSaving}
                className={cn(
                  'w-full px-4 py-2 rounded-t-lg border-x border-t transition-colors text-sm',
                  'focus:outline-none focus-visible:ring-2',
                  'disabled:bg-neutral-100 disabled:cursor-not-allowed',
                  'border-neutral-300 focus-visible:ring-primary-500',
                )}
                aria-label="Search banks"
              />
              {bankNameValue && (
                <div className="flex items-center gap-2 px-4 py-2 bg-green-50 border-x border-green-300 text-green-700 text-sm">
                  <span className="font-medium">Selected:</span>
                  <span>{bankNameValue}</span>
                </div>
              )}
              <select
                id="bankName"
                value={bankNameValue}
                onChange={(e) => {
                  if (e.target.value === OTHER_BANK_VALUE) {
                    setIsOtherBank(true);
                    setValue('bankName', '');
                  } else {
                    setValue('bankName', e.target.value);
                  }
                  setSearchTerm('');
                }}
                disabled={isSaving}
                size={6}
                className={cn(
                  'w-full px-4 py-2 rounded-b-lg border transition-colors bg-white',
                  'focus:outline-none focus-visible:ring-2',
                  'disabled:bg-neutral-100 disabled:cursor-not-allowed',
                  errors.bankName
                    ? 'border-error-600 focus-visible:ring-error-600'
                    : 'border-neutral-300 focus-visible:ring-primary-500',
                )}
              >
                <option value="" disabled>-- Select your bank --</option>
                {Object.entries(filteredCategories).map(([category, banks]) => (
                  <optgroup key={category} label={category}>
                    {banks.map((bank) => (
                      <option key={bank} value={bank}>{bank}</option>
                    ))}
                  </optgroup>
                ))}
                <optgroup label="Other">
                  <option value={OTHER_BANK_VALUE}>Other (type bank name)</option>
                </optgroup>
              </select>
            </>
          ) : (
            <>
              <input
                id="bankName"
                type="text"
                {...register('bankName')}
                disabled={isSaving}
                placeholder="Enter your bank name"
                className={inputClass(!!errors.bankName)}
              />
              <button
                type="button"
                onClick={() => {
                  setIsOtherBank(false);
                  setValue('bankName', '');
                }}
                disabled={isSaving}
                className="text-sm text-primary-600 hover:text-primary-700 underline mt-1"
              >
                Back to bank list
              </button>
            </>
          )}
          {errors.bankName && <p className="mt-1 text-error-600 text-sm">{errors.bankName.message}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="accountNumber" className="block text-sm font-medium text-neutral-700">Account Number</label>
            <input
              id="accountNumber"
              type="text"
              inputMode="numeric"
              maxLength={10}
              {...register('accountNumber')}
              disabled={isSaving}
              placeholder="10-digit account number"
              className={inputClass(!!errors.accountNumber)}
            />
            {errors.accountNumber ? (
              <p className="mt-1 text-error-600 text-sm">{errors.accountNumber.message}</p>
            ) : (
              <p className="mt-1 text-right text-xs text-neutral-400">{accountNumberValue.length}/10 digits</p>
            )}
          </div>

          <div>
            <label htmlFor="accountName" className="block text-sm font-medium text-neutral-700">Account Name</label>
            <input
              id="accountName"
              type="text"
              {...register('accountName')}
              disabled={isSaving}
              placeholder="Name on bank account"
              className={inputClass(!!errors.accountName)}
            />
            {errors.accountName && <p className="mt-1 text-error-600 text-sm">{errors.accountName.message}</p>}
          </div>
        </div>
      </div>
    </form>
  );
}
