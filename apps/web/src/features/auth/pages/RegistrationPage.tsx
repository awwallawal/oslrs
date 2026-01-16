import { RegistrationForm } from '../components/RegistrationForm';

/**
 * Public user registration page
 *
 * Displays the registration form with proper branding and layout.
 */
export default function RegistrationPage() {
  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col">
      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-6">
        <RegistrationForm />
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-sm text-neutral-500">
        <p>&copy; {new Date().getFullYear()} Oyo State Labour & Skills Registry</p>
      </footer>
    </div>
  );
}
