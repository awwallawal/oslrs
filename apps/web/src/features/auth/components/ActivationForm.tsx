import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { activationSchema, type ActivationPayload } from '@oslsr/types';
import { useState } from 'react';
import { PasswordRequirements } from './PasswordRequirements';

interface ActivationFormProps {
  token: string;
  onSuccess: (data: any) => void;
}

export function ActivationForm({ token, onSuccess }: ActivationFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ActivationPayload>({
    resolver: zodResolver(activationSchema),
  });

  // Watch password for real-time requirements feedback
  const password = watch('password', '');

  const onSubmit = async (data: ActivationPayload) => {
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`http://localhost:3000/api/v1/auth/activate/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await response.json();
      if (!response.ok) {
        let message = 'Activation failed. Please try again.';
        if (result.code === 'AUTH_INVALID_TOKEN') message = 'This activation link is invalid or has expired.';
        if (result.code === 'AUTH_ALREADY_ACTIVATED') message = 'This account has already been activated.';
        if (result.code === 'PROFILE_NIN_DUPLICATE') message = 'This NIN is already associated with another account.';
        throw new Error(message);
      }

      onSuccess(result.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-md mx-auto p-6 bg-white rounded shadow">
      <h2 className="text-2xl font-bold text-center">Complete Your Profile</h2>
      
      {error && <div className="p-3 bg-red-100 text-red-700 rounded">{error}</div>}

      <div className="space-y-2">
        <label className="block font-medium">New Password</label>
        <input
          type="password"
          {...register('password')}
          className="w-full p-2 border rounded"
        />
        {errors.password && <p className="text-red-500 text-sm">{errors.password.message}</p>}
        <PasswordRequirements password={password} showAlways={true} className="mt-2" />
      </div>

      <div className="space-y-2">
        <label className="block font-medium">NIN</label>
        <input 
          type="text" 
          {...register('nin')} 
          className="w-full p-2 border rounded"
          placeholder="11 digits"
        />
        {errors.nin && <p className="text-red-500 text-sm">{errors.nin.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="block font-medium">Date of Birth</label>
          <input 
            type="date" 
            {...register('dateOfBirth')} 
            className="w-full p-2 border rounded"
          />
          {errors.dateOfBirth && <p className="text-red-500 text-sm">{errors.dateOfBirth.message}</p>}
        </div>
        <div className="space-y-2">
          <label className="block font-medium">Phone</label>
          <input 
            type="text" 
            {...register('nextOfKinPhone')} 
            className="w-full p-2 border rounded"
          />
          {errors.nextOfKinPhone && <p className="text-red-500 text-sm">{errors.nextOfKinPhone.message}</p>}
        </div>
      </div>

      <div className="space-y-2">
        <label className="block font-medium">Home Address</label>
        <textarea 
          {...register('homeAddress')} 
          className="w-full p-2 border rounded"
        />
        {errors.homeAddress && <p className="text-red-500 text-sm">{errors.homeAddress.message}</p>}
      </div>

      <div className="border-t pt-4">
        <h3 className="font-bold mb-2">Bank Details</h3>
        <div className="space-y-2">
          <input 
            type="text" 
            {...register('bankName')} 
            placeholder="Bank Name" 
            className="w-full p-2 border rounded"
          />
          <input 
            type="text" 
            {...register('accountNumber')} 
            placeholder="Account Number" 
            className="w-full p-2 border rounded"
          />
          <input 
            type="text" 
            {...register('accountName')} 
            placeholder="Account Name" 
            className="w-full p-2 border rounded"
          />
        </div>
      </div>

      <div className="border-t pt-4">
        <h3 className="font-bold mb-2">Next of Kin</h3>
        <input 
          type="text" 
          {...register('nextOfKinName')} 
          placeholder="Name" 
          className="w-full p-2 border rounded"
        />
      </div>

      <button 
        type="submit" 
        disabled={isSubmitting}
        className="w-full p-3 bg-red-700 text-white rounded font-bold hover:bg-red-800 disabled:bg-gray-400"
      >
        {isSubmitting ? 'Activating...' : 'Activate Account'}
      </button>
    </form>
  );
}
