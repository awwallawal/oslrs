import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { WizardNavigation } from '../components/WizardNavigation';
import { EmailTypoDetection } from '../components/EmailTypoDetection';
import { fetchPublicLgas, type WizardDraftData } from '../api/wizard.api';

/**
 * Story 9-12 AC#1 — Step 2: Contact + LGA.
 *
 * Fields:
 *   - phone (Nigerian +234 normalisation; 080… or +234… accepted)
 *   - email (with EmailTypoDetection on blur — AC#5)
 *   - lgaId (autocomplete from 33 Oyo LGAs — `/lgas/public`)
 */

export interface StepProps {
  formData: WizardDraftData;
  mergeFields: (patch: Partial<WizardDraftData>) => void;
  onContinue: () => void;
  onBack?: () => void;
}

function normalisePhone(raw: string): string {
  const cleaned = raw.replace(/\s+/g, '').replace(/-/g, '');
  if (cleaned.startsWith('0') && cleaned.length === 11) return '+234' + cleaned.slice(1);
  if (cleaned.startsWith('234') && cleaned.length === 13) return '+' + cleaned;
  return cleaned;
}

function isValidNigerianPhone(value: string | undefined): boolean {
  if (!value) return false;
  const n = normalisePhone(value);
  return /^\+234[0-9]{10}$/.test(n);
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function Step2ContactLga({ formData, mergeFields, onContinue, onBack }: StepProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [emailBlurred, setEmailBlurred] = useState(false);

  const lgaQuery = useQuery({
    queryKey: ['wizard', 'lgas', 'public'],
    queryFn: fetchPublicLgas,
    staleTime: 24 * 60 * 60 * 1000, // 24h — Oyo LGAs don't churn.
  });

  useEffect(() => {
    const el = document.getElementById('wizard-phone');
    if (el) el.focus();
  }, []);

  // Story 13-16 (AC1) — the select now writes the LGA slug (lga.code), the
  // canonical respondents.lga_id vocabulary. Drafts saved before the switch
  // hold the row UUID (lga.id); remap them to the slug once the list loads so
  // the resumed draft pre-selects correctly and submits the slug.
  // NOTE (review L3): this remap only runs if the user re-enters Step 2 — a
  // draft resumed at a later step submits the UUID untouched. The SERVER guard
  // (canonicalizeLgaId at both public write-sites) is the authoritative net;
  // never remove it on the strength of this client-side remap.
  const lgaList = lgaQuery.data;
  const draftLgaId = formData.lgaId;
  useEffect(() => {
    if (!draftLgaId || !lgaList) return;
    const staleUuidMatch = lgaList.find((l) => l.id === draftLgaId);
    if (staleUuidMatch) mergeFields({ lgaId: staleUuidMatch.code });
    // mergeFields is a stable callback from WizardPage; keyed on the data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftLgaId, lgaList]);

  function validate(): boolean {
    const next: Record<string, string> = {};
    const phone = formData.phone ?? '';
    const email = (formData.email ?? '').trim().toLowerCase();
    const lgaId = formData.lgaId ?? '';

    if (!phone) next.phone = 'Phone number is required.';
    else if (!isValidNigerianPhone(phone))
      next.phone = 'Enter a Nigerian number in 080… or +234… format.';

    if (!email) next.email = 'Email is required.';
    else if (!EMAIL_PATTERN.test(email)) next.email = 'Enter a valid email address.';

    if (!lgaId) next.lgaId = 'Choose your LGA.';

    setErrors(next);
    setTouched({ phone: true, email: true, lgaId: true });
    return Object.keys(next).length === 0;
  }

  function handleContinue() {
    if (validate()) {
      // Normalise phone + email on advance.
      mergeFields({
        phone: normalisePhone(formData.phone ?? ''),
        email: (formData.email ?? '').trim().toLowerCase(),
      });
      onContinue();
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleContinue();
      }}
      noValidate
      data-testid="step2-contact-lga"
    >
      <header className="mb-6">
        <h2 className="text-xl font-semibold text-neutral-900">How can we reach you?</h2>
        <p className="mt-1 text-sm text-neutral-600">
          We'll send your registration confirmation to this email. You can resume on any device
          from the link we send.
        </p>
      </header>

      <div className="space-y-5">
        {/* Phone */}
        <div className="space-y-1.5">
          <label htmlFor="wizard-phone" className="block text-sm font-medium text-neutral-700">
            Phone Number
          </label>
          <input
            id="wizard-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            value={formData.phone ?? ''}
            onChange={(e) => mergeFields({ phone: e.target.value })}
            onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
            aria-invalid={!!(touched.phone && errors.phone)}
            aria-describedby={errors.phone ? 'wizard-phone-error' : undefined}
            placeholder="080 1234 5678"
            className="w-full rounded-lg border border-neutral-300 px-4 py-3 font-mono focus:border-primary-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            data-testid="wizard-phone"
          />
          {touched.phone && errors.phone && (
            <p id="wizard-phone-error" className="text-sm text-error-600">
              {errors.phone}
            </p>
          )}
        </div>

        {/* Email */}
        <div className="space-y-1.5">
          <label htmlFor="wizard-email" className="block text-sm font-medium text-neutral-700">
            Email Address
          </label>
          <input
            id="wizard-email"
            name="email"
            type="email"
            autoComplete="email"
            value={formData.email ?? ''}
            onChange={(e) => mergeFields({ email: e.target.value })}
            onBlur={() => {
              setTouched((t) => ({ ...t, email: true }));
              setEmailBlurred(true);
            }}
            aria-invalid={!!(touched.email && errors.email)}
            aria-describedby={errors.email ? 'wizard-email-error' : undefined}
            placeholder="you@example.com"
            className="w-full rounded-lg border border-neutral-300 px-4 py-3 focus:border-primary-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            data-testid="wizard-email"
          />
          {emailBlurred && formData.email && (
            <EmailTypoDetection
              email={formData.email}
              onAccept={(corrected) => mergeFields({ email: corrected })}
            />
          )}
          {touched.email && errors.email && (
            <p id="wizard-email-error" className="text-sm text-error-600">
              {errors.email}
            </p>
          )}
        </div>

        {/* LGA */}
        <div className="space-y-1.5">
          <label htmlFor="wizard-lga" className="block text-sm font-medium text-neutral-700">
            Local Government Area
          </label>
          <select
            id="wizard-lga"
            name="lgaId"
            value={formData.lgaId ?? ''}
            onChange={(e) => mergeFields({ lgaId: e.target.value })}
            onBlur={() => setTouched((t) => ({ ...t, lgaId: true }))}
            disabled={lgaQuery.isLoading}
            aria-invalid={!!(touched.lgaId && errors.lgaId)}
            aria-describedby={errors.lgaId ? 'wizard-lga-error' : undefined}
            className="w-full rounded-lg border border-neutral-300 bg-white px-4 py-3 focus:border-primary-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-50"
            data-testid="wizard-lga"
          >
            <option value="">
              {lgaQuery.isLoading ? 'Loading LGAs…' : 'Select your LGA'}
            </option>
            {/* Story 13-16 (AC1) — value is the SLUG (lga.code): the canonical
                respondents.lga_id vocabulary shared with the enumerator form
                and every analytics join. */}
            {(lgaQuery.data ?? []).map((lga) => (
              <option key={lga.id} value={lga.code}>
                {lga.name}
              </option>
            ))}
          </select>
          {lgaQuery.isError && (
            <p className="text-sm text-warning-700">
              Couldn't load the LGA list. Please try again in a moment.
            </p>
          )}
          {touched.lgaId && errors.lgaId && (
            <p id="wizard-lga-error" className="text-sm text-error-600">
              {errors.lgaId}
            </p>
          )}
        </div>
      </div>

      <WizardNavigation onBack={onBack} onContinue={handleContinue} />
    </form>
  );
}
