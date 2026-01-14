// Context & Provider
export { AuthProvider, useAuth, useRequireRole, AuthContext } from './context/AuthContext';

// Hooks
export { useLogin } from './hooks/useLogin';
export { useForgotPassword, useResetPassword } from './hooks/usePasswordReset';
export { useReAuth, withReAuth } from './hooks/useReAuth';

// Components
export { ProtectedRoute, PublicOnlyRoute, RoleGate } from './components/ProtectedRoute';
export { LoginForm } from './components/LoginForm';
export { HCaptcha } from './components/HCaptcha';
export { ReAuthModal } from './components/ReAuthModal';
export { PasswordRequirements, PasswordStrengthIndicator } from './components/PasswordRequirements';

// API
export { AuthApiError } from './api/auth.api';
export * as authApi from './api/auth.api';
