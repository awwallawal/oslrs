import { useLocation } from 'react-router-dom';
import { LoginForm } from '../components/LoginForm';

/**
 * Staff Login page component
 *
 * Dedicated login page for OSLSR staff members.
 */
export default function StaffLoginPage() {
  const location = useLocation();

  // Get redirect destination from state (set by ProtectedRoute)
  const from = (location.state as any)?.from || '/admin';

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col">
      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-6">
        <LoginForm type="staff" redirectTo={from} />
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-sm text-neutral-500">
        <p>&copy; {new Date().getFullYear()} Oyo State Labour & Skills Registry</p>
        <p className="text-xs mt-1">Administrative Portal</p>
      </footer>
    </div>
  );
}
