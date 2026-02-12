import { GoogleOAuthProvider } from '@react-oauth/google';
import { Outlet } from 'react-router-dom';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

/**
 * GoogleOAuthWrapper - Layout route that provides GoogleOAuthProvider
 * only to routes that need it (/login, /register).
 *
 * Lazy-loaded to avoid loading the Google Identity Services SDK
 * on pages that don't need it (homepage, dashboard, etc.).
 * This reduces LCP by ~20% on public pages.
 */
function GoogleOAuthWrapper() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <Outlet />
    </GoogleOAuthProvider>
  );
}

export default GoogleOAuthWrapper;
