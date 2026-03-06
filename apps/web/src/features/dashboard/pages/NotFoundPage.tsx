import { Link } from 'react-router-dom';
import { useAuth } from '../../auth';
import { roleRouteMap } from '../config/sidebarConfig';
import type { UserRole } from '@oslsr/types';

export default function NotFoundPage() {
  const { user } = useAuth();
  const dashboardPath = user?.role
    ? roleRouteMap[user.role as UserRole] ?? '/dashboard'
    : '/dashboard';

  return (
    <div className="flex items-center justify-center py-24 px-6">
      <div className="text-center max-w-md">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
          <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
        </div>
        <h1 className="text-2xl font-semibold text-neutral-900 mb-2">Page not found</h1>
        <p className="text-neutral-600 mb-6">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link
          to={dashboardPath}
          className="inline-block px-6 py-3 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
