/**
 * Profile Page (Story 9.1)
 *
 * View and edit user profile information.
 * View mode: displays all profile fields with resolved LGA name.
 * Edit mode: inline form for editable fields with Zod validation.
 */

import { useState } from 'react';
import { useProfile, useUpdateProfile } from '../hooks/useProfile';
import { useAuth } from '../../auth/context/AuthContext';
import { getRoleDisplayName } from '@oslsr/types';
import { SkeletonForm } from '../../../components/skeletons';
import ProfileEditForm from '../components/ProfileEditForm';
import type { UserProfile } from '../api/profile.api';

function getStatusBadge(status: string) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    active: { bg: 'bg-green-50', text: 'text-green-700', label: 'Active' },
    verified: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Verified' },
    invited: { bg: 'bg-yellow-50', text: 'text-yellow-700', label: 'Invited' },
    suspended: { bg: 'bg-red-50', text: 'text-red-700', label: 'Suspended' },
    deactivated: { bg: 'bg-neutral-100', text: 'text-neutral-600', label: 'Deactivated' },
    pending_verification: { bg: 'bg-orange-50', text: 'text-orange-700', label: 'Pending Verification' },
  };
  const badge = map[status] ?? { bg: 'bg-neutral-100', text: 'text-neutral-600', label: status };
  return (
    <span className={`inline-flex items-center rounded-full ${badge.bg} px-2 py-0.5 text-xs font-medium ${badge.text}`}>
      {badge.label}
    </span>
  );
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-NG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function ProfileViewField({ label, value, isReadOnly }: { label: string; value: string | null | undefined; isReadOnly?: boolean }) {
  return (
    <div>
      <label className="block text-sm font-medium text-neutral-500">{label}</label>
      <p className={`mt-1 ${isReadOnly ? 'text-neutral-500' : 'text-neutral-900'}`}>
        {value || <span className="text-neutral-400 italic">Not set</span>}
      </p>
    </div>
  );
}

function ProfileViewMode({ profile, onEdit }: { profile: UserProfile; onEdit: () => void }) {
  const displayName = profile.fullName || profile.email.split('@')[0];
  const initials = displayName
    .split(' ')
    .map((n) => n.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('');
  const roleDisplay = getRoleDisplayName(profile.roleName);

  return (
    <>
      {/* Profile Header */}
      <div className="flex items-center gap-4 mb-6 pb-6 border-b border-neutral-100">
        <div className="relative">
          {profile.liveSelfieOriginalUrl ? (
            <img
              src={profile.liveSelfieOriginalUrl}
              alt={displayName}
              className="h-16 w-16 rounded-full object-cover border-2 border-neutral-200"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-600 text-white text-xl font-semibold">
              {initials}
            </div>
          )}
        </div>
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">{displayName}</h2>
          <p className="text-neutral-600">{profile.email}</p>
          <span className="mt-1 inline-block rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">
            {roleDisplay}
          </span>
        </div>
      </div>

      {/* Profile Details */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide">Account Information</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ProfileViewField label="Full Name" value={profile.fullName} />
          <ProfileViewField label="Email Address" value={profile.email} isReadOnly />
          <ProfileViewField label="Phone" value={profile.phone} />
          <ProfileViewField label="Role" value={roleDisplay} isReadOnly />
          <ProfileViewField label="Assigned LGA" value={profile.lgaName} isReadOnly />
          <div>
            <label className="block text-sm font-medium text-neutral-500">Account Status</label>
            <p className="mt-1">{getStatusBadge(profile.status)}</p>
          </div>
          <ProfileViewField label="Member Since" value={formatDate(profile.createdAt)} isReadOnly />
        </div>
      </div>

      {/* Personal Details */}
      <div className="mt-6 pt-6 border-t border-neutral-100 space-y-4">
        <h3 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide">Personal Details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ProfileViewField label="Home Address" value={profile.homeAddress} />
          <ProfileViewField label="Next of Kin" value={profile.nextOfKinName} />
          <ProfileViewField label="Next of Kin Phone" value={profile.nextOfKinPhone} />
        </div>
      </div>

      {/* Bank Details */}
      <div className="mt-6 pt-6 border-t border-neutral-100 space-y-4">
        <h3 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide">Bank Details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ProfileViewField label="Bank Name" value={profile.bankName} />
          <ProfileViewField label="Account Number" value={profile.accountNumber} />
          <ProfileViewField label="Account Name" value={profile.accountName} />
        </div>
      </div>

      {/* Edit Button */}
      <div className="mt-6 pt-6 border-t border-neutral-100">
        <button
          type="button"
          onClick={onEdit}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium text-sm"
        >
          Edit Profile
        </button>
      </div>
    </>
  );
}

export default function ProfilePage() {
  const { isLoading: authLoading } = useAuth();
  const { data: profile, isLoading: profileLoading, error } = useProfile();
  const updateProfileMutation = useUpdateProfile();
  const [isEditing, setIsEditing] = useState(false);

  if (authLoading || profileLoading) {
    return (
      <div className="p-6 max-w-2xl">
        <SkeletonForm fields={6} />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="p-6">
        <p className="text-neutral-600">Unable to load profile information.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-brand font-semibold text-neutral-900">My Profile</h1>
        <p className="text-neutral-600 mt-1">View and manage your account information</p>
      </div>

      <div className="bg-white rounded-xl border border-neutral-200 p-6">
        {isEditing ? (
          <ProfileEditForm
            profile={profile}
            onCancel={() => setIsEditing(false)}
            onSave={(data) => {
              updateProfileMutation.mutate(data, {
                onSuccess: () => setIsEditing(false),
              });
            }}
            isSaving={updateProfileMutation.isPending}
          />
        ) : (
          <ProfileViewMode profile={profile} onEdit={() => setIsEditing(true)} />
        )}
      </div>
    </div>
  );
}
