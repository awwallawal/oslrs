/**
 * Profile Page
 *
 * Story 2.5-1: User profile page accessible from the profile dropdown.
 * Common to all roles - shows user information and settings.
 */

import { useAuth } from '../../auth/context/AuthContext';
import { getRoleDisplayName } from '@oslsr/types';
import { SkeletonCard, SkeletonForm } from '../../../components/skeletons';

export default function ProfilePage() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="p-6">
        <SkeletonForm fields={4} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-6">
        <p className="text-neutral-600">Unable to load profile information.</p>
      </div>
    );
  }

  const displayName = user.fullName || user.email.split('@')[0];
  const roleDisplay = getRoleDisplayName(user.role);

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-brand font-semibold text-neutral-900">
          My Profile
        </h1>
        <p className="text-neutral-600 mt-1">
          View and manage your account information
        </p>
      </div>

      <div className="bg-white rounded-xl border border-neutral-200 p-6">
        {/* Profile Header */}
        <div className="flex items-center gap-4 mb-6 pb-6 border-b border-neutral-100">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-600 text-white text-xl font-semibold">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">{displayName}</h2>
            <p className="text-neutral-600">{user.email}</p>
            <span className="mt-1 inline-block rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">
              {roleDisplay}
            </span>
          </div>
        </div>

        {/* Profile Details */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-500">Email Address</label>
            <p className="mt-1 text-neutral-900">{user.email}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-500">Role</label>
            <p className="mt-1 text-neutral-900">{roleDisplay}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-500">Account Status</label>
            <p className="mt-1">
              <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                Active
              </span>
            </p>
          </div>
        </div>

        {/* Placeholder for edit functionality */}
        <div className="mt-6 pt-6 border-t border-neutral-100">
          <SkeletonCard className="h-24" />
          <p className="mt-2 text-sm text-neutral-500">
            Profile editing features will be implemented in a future story.
          </p>
        </div>
      </div>
    </div>
  );
}
