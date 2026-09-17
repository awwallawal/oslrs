/**
 * StaffDetailModal — the full record for one staff member.
 *
 * Why this exists: everything an enumerator fills in at activation (bank name,
 * account number, account name, NIN, date of birth, home address, next of kin)
 * was collected, stored, and shown NOWHERE. The list gives name/email/role/LGA/
 * status, and there was no detail route at all — so the operator could not read
 * the details needed to pay somebody without querying the database.
 *
 * ⚠️ This renders PII. The server audits the read (`staff.detail_viewed`); the
 * account number is masked until explicitly revealed, so a screen-share or a
 * shoulder in an open-plan office does not leak eleven account numbers at once.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Eye, EyeOff, Loader2, X } from 'lucide-react';
import { getStaffDetail } from '../api/staff.api';

interface StaffDetailModalProps {
  userId: string | null;
  onClose: () => void;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="py-2">
      <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-neutral-900">
        {/* An empty string is not the same as "not provided" — say which. */}
        {value === null || value === undefined || value === '' ? (
          <span className="text-neutral-400">Not provided</span>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

export function StaffDetailModal({ userId, onClose }: StaffDetailModalProps) {
  const [revealAccount, setRevealAccount] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['staff', 'detail', userId],
    queryFn: () => getStaffDetail(userId!),
    enabled: !!userId,
  });

  if (!userId) return null;
  const d = data?.data;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Staff details"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-neutral-200 p-5">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">
              {d?.fullName ?? 'Staff details'}
            </h2>
            {d && (
              <p className="mt-0.5 text-sm text-neutral-500">
                {d.roleName ?? '—'} · {d.lgaName ?? 'No LGA'} · {d.status}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5">
          {isLoading && (
            <div className="flex items-center gap-2 py-8 text-neutral-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading details…
            </div>
          )}

          {isError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {(error as Error)?.message ?? 'Could not load these details.'}
            </div>
          )}

          {d && (
            <>
              {/*
                A bank rejects a transfer whose account name does not match the
                name on the account. Measured 2026-09-17: four of eleven
                activated enumerators differ. Surfacing it HERE means it is seen
                before a batch is built, not after a transfer bounces.
                `null` means no account name on file yet — not a mismatch — so it
                shows nothing rather than a false alarm.
              */}
              {d.accountNameMatchesFullName === false && (
                <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                  <p className="text-sm text-amber-800">
                    <span className="font-medium">Account name does not match the full name.</span>{' '}
                    A transfer may be rejected. Confirm with the staff member before including them
                    in a payment batch.
                  </p>
                </div>
              )}

              <div className="grid gap-x-8 sm:grid-cols-2">
                <dl>
                  <Field label="Email" value={d.email} />
                  <Field label="Phone" value={d.phone} />
                  <Field label="NIN" value={d.nin} />
                  <Field label="Date of birth" value={d.dateOfBirth} />
                  <Field label="Home address" value={d.homeAddress} />
                  <Field label="Next of kin" value={d.nextOfKinName} />
                  <Field label="Next of kin phone" value={d.nextOfKinPhone} />
                </dl>
                <dl>
                  <Field label="Bank" value={d.bankName} />
                  <Field
                    label="Account number"
                    value={
                      d.accountNumber ? (
                        <span className="flex items-center gap-2">
                          <span className="font-mono">
                            {revealAccount ? d.accountNumber : `••••••${d.accountNumber.slice(-4)}`}
                          </span>
                          <button
                            type="button"
                            onClick={() => setRevealAccount((v) => !v)}
                            aria-label={
                              revealAccount ? 'Hide account number' : 'Reveal account number'
                            }
                            className="text-neutral-500 hover:text-neutral-700"
                          >
                            {revealAccount ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </span>
                      ) : null
                    }
                  />
                  <Field label="Account name" value={d.accountName} />
                  <Field label="Respondents captured" value={String(d.capturedCount)} />
                  <Field
                    label="Invited"
                    value={d.invitedAt ? new Date(d.invitedAt).toLocaleString() : null}
                  />
                  <Field
                    label="Last login"
                    value={
                      d.lastLoginAt ? (
                        new Date(d.lastLoginAt).toLocaleString()
                      ) : (
                        /*
                          "Never" is load-bearing, not cosmetic. An activated
                          account that has never logged in is the §0.1a
                          signature — the person cannot work out their own login
                          address — and it reads as apathy unless it is named.
                        */
                        <span className="text-amber-700">Never logged in</span>
                      )
                    }
                  />
                </dl>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
