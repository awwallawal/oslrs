import { useLocation } from 'react-router-dom';
import { LoginForm } from '../components/LoginForm';

interface LoginPageProps {
  type?: 'staff' | 'public';
}

/**
 * Login page component
 *
 * Displays the login form with proper branding and layout.
 * Handles redirect after successful login.
 */
export default function LoginPage({ type = 'public' }: LoginPageProps) {
  const location = useLocation();

  // Get redirect destination from state (set by ProtectedRoute)
  const state = location.state as { from?: string } | null;
  const from = state?.from || '/dashboard';

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col">
      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-6">
        <LoginForm type={type} redirectTo={from} />
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-sm text-neutral-500">
        <p>&copy; {new Date().getFullYear()} Oyo State Labour & Skills Registry</p>
      </footer>
    </div>
  );
}
