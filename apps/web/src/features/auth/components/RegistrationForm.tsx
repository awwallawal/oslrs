import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, AlertCircle, Loader2, CheckCircle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { HCaptcha } from './HCaptcha';
import { PasswordRequirements } from './PasswordRequirements';
import { publicRegister, AuthApiError } from '../api/auth.api';
import { verhoeffCheck } from '@oslsr/utils';

// Registration form validation schema
const registrationSchema = z.object({
  fullName: z.string()
    .min(2, 'Full name must be at least 2 characters')
    .max(100, 'Full name must be at most 100 characters')
    .regex(/^[a-zA-Z\s\-']+$/, 'Full name can only contain letters, spaces, hyphens and apostrophes'),
  email: z.string()
    .email('Invalid email format')
    .max(255, 'Email must be at most 255 characters'),
  phone: z.string()
    .min(10, 'Phone number is required')
    .transform((phone) => {
      const cleaned = phone.replace(/\s+/g, '').replace(/-/g, '');
      if (cleaned.startsWith('0') && cleaned.length === 11) {
        return '+234' + cleaned.slice(1);
      }
      if (cleaned.startsWith('234') && cleaned.length === 13) {
        return '+' + cleaned;
      }
      return cleaned;
    }),
  nin: z.string()
    .length(11, 'NIN must be exactly 11 digits')
    .regex(/^\d{11}$/, 'NIN must contain only digits')
    .refine(verhoeffCheck, 'Invalid NIN format'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

type RegistrationFormData = z.infer<typeof registrationSchema>;

/**
 * Registration form component for public user self-registration
 */
export function RegistrationForm() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaReset, setCaptchaReset] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegistrationFormData>({
    resolver: zodResolver(registrationSchema),
    mode: 'onChange',
  });

  const password = watch('password', '');

  const onSubmit = async (data: RegistrationFormData) => {
    if (!captchaToken) {
      setApiError('Please complete the CAPTCHA verification');
      return;
    }

    setIsLoading(true);
    setApiError(null);

    try {
      await publicRegister({
        fullName: data.fullName.trim(),
        email: data.email.toLowerCase().trim(),
        phone: data.phone,
        nin: data.nin,
        password: data.password,
        confirmPassword: data.confirmPassword,
        captchaToken,
      });

      setRegisteredEmail(data.email.toLowerCase().trim());
      setIsSuccess(true);
    } catch (err) {
      if (err instanceof AuthApiError) {
        if (err.code === 'REGISTRATION_NIN_EXISTS') {
          setApiError('This NIN is already registered. Please login instead.');
        } else if (err.code === 'RATE_LIMIT_EXCEEDED') {
          setApiError('Too many registration attempts. Please try again later.');
        } else {
          setApiError(err.message || 'Registration failed. Please try again.');
        }
      } else {
        setApiError('Registration failed. Please check your details and try again.');
      }
      // Reset CAPTCHA on error
      setCaptchaToken('');
      setCaptchaReset((prev) => !prev);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCaptchaVerify = (token: string) => {
    setCaptchaToken(token);
  };

  const handleCaptchaExpire = () => {
    setCaptchaToken('');
    setCaptchaReset((prev) => !prev);
  };

  // Show success message after registration
  if (isSuccess) {
    return (
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-h1 text-primary-700 font-brand mb-2">OSLSR</h1>
        </div>

        <div className="p-6 bg-success-50 border border-success-200 rounded-lg">
          <div className="flex items-center gap-3 mb-4">
            <CheckCircle className="w-8 h-8 text-success-600" />
            <h2 className="text-xl font-semibold text-success-800">Registration Successful!</h2>
          </div>
          <p className="text-success-700 mb-4">
            We've sent a verification email to <strong>{registeredEmail}</strong>.
          </p>
          <p className="text-success-600 text-sm mb-6">
            Please check your inbox and click the verification link to activate your account.
            The link will expire in 24 hours.
          </p>
          <div className="space-y-3">
            <button
              onClick={() => navigate('/login')}
              className="w-full py-3 px-4 rounded-lg font-semibold text-white bg-primary-600 hover:bg-primary-700 transition-colors"
            >
              Go to Login
            </button>
            <Link
              to="/resend-verification"
              className="block text-center text-sm text-primary-600 hover:text-primary-700 hover:underline"
            >
              Didn't receive the email? Resend verification
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-h1 text-primary-700 font-brand mb-2">OSLSR</h1>
        <h2 className="text-xl font-semibold text-neutral-900 mb-1">Create Account</h2>
        <p className="text-neutral-600">Register for the Oyo State Labour & Skills Registry</p>
      </div>

      {/* Error Alert */}
      {apiError && (
        <div className="mb-6 p-4 bg-error-100 border border-error-600/20 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-error-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-error-600 font-medium">Registration Failed</p>
            <p className="text-error-600/80 text-sm">{apiError}</p>
          </div>
        </div>
      )}

      {/* Registration Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Full Name */}
        <div className="space-y-1.5">
          <label htmlFor="fullName" className="block text-sm font-medium text-neutral-700">
            Full Name
          </label>
          <input
            id="fullName"
            type="text"
            autoComplete="name"
            {...register('fullName')}
            disabled={isLoading}
            className={`
              w-full px-4 py-3 rounded-lg border transition-colors
              ${errors.fullName
                ? 'border-error-600 focus:ring-error-600 focus:border-error-600'
                : 'border-neutral-300 focus:ring-primary-500 focus:border-primary-500'
              }
              disabled:bg-neutral-100 disabled:cursor-not-allowed
              focus:outline-none focus:ring-2
            `}
            placeholder="Enter your full name"
          />
          {errors.fullName && (
            <p className="text-error-600 text-sm">{errors.fullName.message}</p>
          )}
        </div>

        {/* Email */}
        <div className="space-y-1.5">
          <label htmlFor="email" className="block text-sm font-medium text-neutral-700">
            Email Address
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            {...register('email')}
            disabled={isLoading}
            className={`
              w-full px-4 py-3 rounded-lg border transition-colors
              ${errors.email
                ? 'border-error-600 focus:ring-error-600 focus:border-error-600'
                : 'border-neutral-300 focus:ring-primary-500 focus:border-primary-500'
              }
              disabled:bg-neutral-100 disabled:cursor-not-allowed
              focus:outline-none focus:ring-2
            `}
            placeholder="you@example.com"
          />
          {errors.email && (
            <p className="text-error-600 text-sm">{errors.email.message}</p>
          )}
        </div>

        {/* Phone */}
        <div className="space-y-1.5">
          <label htmlFor="phone" className="block text-sm font-medium text-neutral-700">
            Phone Number
          </label>
          <input
            id="phone"
            type="tel"
            autoComplete="tel"
            {...register('phone')}
            disabled={isLoading}
            className={`
              w-full px-4 py-3 rounded-lg border transition-colors
              ${errors.phone
                ? 'border-error-600 focus:ring-error-600 focus:border-error-600'
                : 'border-neutral-300 focus:ring-primary-500 focus:border-primary-500'
              }
              disabled:bg-neutral-100 disabled:cursor-not-allowed
              focus:outline-none focus:ring-2
            `}
            placeholder="08012345678 or +2348012345678"
          />
          {errors.phone && (
            <p className="text-error-600 text-sm">{errors.phone.message}</p>
          )}
        </div>

        {/* NIN */}
        <div className="space-y-1.5">
          <label htmlFor="nin" className="block text-sm font-medium text-neutral-700">
            National Identification Number (NIN)
          </label>
          <input
            id="nin"
            type="text"
            inputMode="numeric"
            maxLength={11}
            {...register('nin')}
            disabled={isLoading}
            className={`
              w-full px-4 py-3 rounded-lg border transition-colors
              ${errors.nin
                ? 'border-error-600 focus:ring-error-600 focus:border-error-600'
                : 'border-neutral-300 focus:ring-primary-500 focus:border-primary-500'
              }
              disabled:bg-neutral-100 disabled:cursor-not-allowed
              focus:outline-none focus:ring-2
            `}
            placeholder="11-digit NIN"
          />
          {errors.nin && (
            <p className="text-error-600 text-sm">{errors.nin.message}</p>
          )}
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <label htmlFor="password" className="block text-sm font-medium text-neutral-700">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              {...register('password')}
              disabled={isLoading}
              className={`
                w-full px-4 py-3 pr-12 rounded-lg border transition-colors
                ${errors.password
                  ? 'border-error-600 focus:ring-error-600 focus:border-error-600'
                  : 'border-neutral-300 focus:ring-primary-500 focus:border-primary-500'
                }
                disabled:bg-neutral-100 disabled:cursor-not-allowed
                focus:outline-none focus:ring-2
              `}
              placeholder="Create a secure password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              disabled={isLoading}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-700 disabled:cursor-not-allowed"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
          {errors.password && (
            <p className="text-error-600 text-sm">{errors.password.message}</p>
          )}
          <PasswordRequirements password={password} showAlways={false} className="mt-2" />
        </div>

        {/* Confirm Password */}
        <div className="space-y-1.5">
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-neutral-700">
            Confirm Password
          </label>
          <div className="relative">
            <input
              id="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              autoComplete="new-password"
              {...register('confirmPassword')}
              disabled={isLoading}
              className={`
                w-full px-4 py-3 pr-12 rounded-lg border transition-colors
                ${errors.confirmPassword
                  ? 'border-error-600 focus:ring-error-600 focus:border-error-600'
                  : 'border-neutral-300 focus:ring-primary-500 focus:border-primary-500'
                }
                disabled:bg-neutral-100 disabled:cursor-not-allowed
                focus:outline-none focus:ring-2
              `}
              placeholder="Confirm your password"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              disabled={isLoading}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-700 disabled:cursor-not-allowed"
              aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
            >
              {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
          {errors.confirmPassword && (
            <p className="text-error-600 text-sm">{errors.confirmPassword.message}</p>
          )}
        </div>

        {/* CAPTCHA */}
        <div className="py-2">
          <HCaptcha
            onVerify={handleCaptchaVerify}
            onExpire={handleCaptchaExpire}
            reset={captchaReset}
          />
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoading || !captchaToken}
          className={`
            w-full py-3 px-4 rounded-lg font-semibold text-white transition-colors
            flex items-center justify-center gap-2
            ${isLoading || !captchaToken
              ? 'bg-neutral-400 cursor-not-allowed'
              : 'bg-primary-600 hover:bg-primary-700 active:bg-primary-800'
            }
          `}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Creating Account...
            </>
          ) : (
            'Create Account'
          )}
        </button>

        {/* Terms */}
        <p className="text-xs text-neutral-500 text-center">
          By creating an account, you agree to our Terms of Service and Privacy Policy.
        </p>
      </form>

      {/* Already have account */}
      <p className="mt-6 text-center text-sm text-neutral-600">
        Already have an account?{' '}
        <Link
          to="/login"
          className="text-primary-600 hover:text-primary-700 font-medium hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
