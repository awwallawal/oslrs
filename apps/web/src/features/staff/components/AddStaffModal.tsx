/**
 * AddStaffModal Component
 * Story 1-3 frontend: Modal for creating a single staff member
 * Backend: POST /api/v1/staff/manual (already exists)
 */

import { useState, useEffect } from 'react';
import { X, Loader2, ChevronDown } from 'lucide-react';
import { FIELD_ROLES, getRoleDisplayName } from '@oslsr/types';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '../../../components/ui/alert-dialog';
import { useCreateStaffManual, useRoles, useLgas } from '../hooks/useStaff';

interface AddStaffModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface FormData {
  fullName: string;
  email: string;
  phone: string;
  roleId: string;
  lgaId: string;
}

interface FormErrors {
  fullName?: string;
  email?: string;
  phone?: string;
  roleId?: string;
  lgaId?: string;
}

export function AddStaffModal({ isOpen, onClose, onSuccess }: AddStaffModalProps) {
  const [formData, setFormData] = useState<FormData>({
    fullName: '',
    email: '',
    phone: '',
    roleId: '',
    lgaId: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});

  const { data: rolesData, isLoading: isLoadingRoles } = useRoles();
  const { data: lgasData, isLoading: isLoadingLgas } = useLgas();
  const createMutation = useCreateStaffManual();

  const roles = rolesData?.data ?? [];
  const lgas = lgasData?.data ?? [];
  const selectedRole = roles.find((r) => r.id === formData.roleId);
  const requiresLga = selectedRole && (FIELD_ROLES as readonly string[]).includes(selectedRole.name);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setFormData({
        fullName: '',
        email: '',
        phone: '',
        roleId: '',
        lgaId: '',
      });
      setErrors({});
    }
  }, [isOpen]);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.fullName.trim()) {
      newErrors.fullName = 'Full name is required';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format';
    }

    if (!formData.phone.trim()) {
      newErrors.phone = 'Phone number is required';
    } else {
      const digitsOnly = formData.phone.replace(/\D/g, '');
      if (digitsOnly.length < 10 || digitsOnly.length > 15) {
        newErrors.phone = 'Phone number must be 10-15 digits';
      }
    }

    if (!formData.roleId) {
      newErrors.roleId = 'Role is required';
    }

    if (requiresLga && !formData.lgaId) {
      newErrors.lgaId = 'LGA is required for this role';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validateForm()) return;

    const payload = {
      fullName: formData.fullName.trim(),
      email: formData.email.trim().toLowerCase(),
      phone: formData.phone.trim(),
      roleId: formData.roleId,
      ...(formData.lgaId && { lgaId: formData.lgaId }),
    };

    createMutation.mutate(payload, {
      onSuccess: () => {
        onSuccess();
        onClose();
      },
    });
  };

  const handleClose = () => {
    if (!createMutation.isPending) {
      onClose();
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center justify-between">
            <AlertDialogTitle>Add Staff Member</AlertDialogTitle>
            <button
              onClick={handleClose}
              disabled={createMutation.isPending}
              className="text-neutral-400 hover:text-neutral-600 disabled:opacity-50"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <AlertDialogDescription asChild>
            <div className="space-y-4 pt-2">
              {/* Full Name */}
              <div>
                <label htmlFor="fullName" className="block text-sm font-medium text-neutral-700 mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="fullName"
                  type="text"
                  value={formData.fullName}
                  onChange={(e) => {
                    setFormData({ ...formData, fullName: e.target.value });
                    if (errors.fullName) setErrors({ ...errors, fullName: undefined });
                  }}
                  className={`w-full px-3 py-2 border rounded-lg text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                    errors.fullName ? 'border-red-300' : 'border-neutral-300'
                  }`}
                  placeholder="Enter full name"
                />
                {errors.fullName && (
                  <p className="mt-1 text-xs text-red-600">{errors.fullName}</p>
                )}
              </div>

              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-neutral-700 mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => {
                    setFormData({ ...formData, email: e.target.value });
                    if (errors.email) setErrors({ ...errors, email: undefined });
                  }}
                  className={`w-full px-3 py-2 border rounded-lg text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                    errors.email ? 'border-red-300' : 'border-neutral-300'
                  }`}
                  placeholder="Enter email address"
                />
                {errors.email && (
                  <p className="mt-1 text-xs text-red-600">{errors.email}</p>
                )}
              </div>

              {/* Phone */}
              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-neutral-700 mb-1">
                  Phone <span className="text-red-500">*</span>
                </label>
                <input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => {
                    setFormData({ ...formData, phone: e.target.value });
                    if (errors.phone) setErrors({ ...errors, phone: undefined });
                  }}
                  className={`w-full px-3 py-2 border rounded-lg text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                    errors.phone ? 'border-red-300' : 'border-neutral-300'
                  }`}
                  placeholder="08012345678"
                />
                {errors.phone && (
                  <p className="mt-1 text-xs text-red-600">{errors.phone}</p>
                )}
              </div>

              {/* Role */}
              <div>
                <label htmlFor="role" className="block text-sm font-medium text-neutral-700 mb-1">
                  Role <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  {isLoadingRoles ? (
                    <div className="flex items-center justify-center py-2">
                      <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
                    </div>
                  ) : (
                    <>
                      <select
                        id="role"
                        value={formData.roleId}
                        onChange={(e) => {
                          setFormData({ ...formData, roleId: e.target.value, lgaId: '' });
                          if (errors.roleId) setErrors({ ...errors, roleId: undefined });
                        }}
                        className={`w-full appearance-none pl-3 pr-10 py-2 border rounded-lg text-sm bg-white text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                          errors.roleId ? 'border-red-300' : 'border-neutral-300'
                        }`}
                      >
                        <option value="">Select a role</option>
                        {roles.map((role) => (
                          <option key={role.id} value={role.id}>
                            {getRoleDisplayName(role.name)}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="w-4 h-4 text-neutral-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </>
                  )}
                </div>
                {errors.roleId && (
                  <p className="mt-1 text-xs text-red-600">{errors.roleId}</p>
                )}
              </div>

              {/* LGA (always visible, enabled only for roles that require it) */}
              <div>
                <label htmlFor="lga" className="block text-sm font-medium text-neutral-700 mb-1">
                  LGA {requiresLga && <span className="text-red-500">*</span>}
                </label>
                <div className="relative">
                  {isLoadingLgas ? (
                    <div className="flex items-center justify-center py-2">
                      <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
                    </div>
                  ) : (
                    <>
                      <select
                        id="lga"
                        value={formData.lgaId}
                        onChange={(e) => {
                          setFormData({ ...formData, lgaId: e.target.value });
                          if (errors.lgaId) setErrors({ ...errors, lgaId: undefined });
                        }}
                        disabled={!requiresLga}
                        className={`w-full appearance-none pl-3 pr-10 py-2 border rounded-lg text-sm bg-white text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-neutral-100 disabled:text-neutral-400 disabled:cursor-not-allowed ${
                          errors.lgaId ? 'border-red-300' : 'border-neutral-300'
                        }`}
                      >
                        <option value="">
                          {requiresLga ? 'Select an LGA' : 'Not required for this role'}
                        </option>
                        {lgas?.map((lga) => (
                          <option key={lga.id} value={lga.id}>
                            {lga.name}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="w-4 h-4 text-neutral-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </>
                  )}
                </div>
                {errors.lgaId && (
                  <p className="mt-1 text-xs text-red-600">{errors.lgaId}</p>
                )}
                <p className="mt-1 text-xs text-neutral-500">
                  {requiresLga
                    ? `Required for ${selectedRole ? getRoleDisplayName(selectedRole.name) : ''} role`
                    : 'Only required for Enumerator and Supervisor roles'}
                </p>
              </div>

              {/* Info message */}
              <p className="text-xs text-neutral-500 bg-neutral-50 p-2 rounded">
                An invitation email will be sent to the staff member to complete their account setup.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={createMutation.isPending}>Cancel</AlertDialogCancel>
          <button
            onClick={handleSubmit}
            disabled={createMutation.isPending || isLoadingRoles || isLoadingLgas}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating...
              </>
            ) : (
              'Add Staff'
            )}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
