/**
 * About Feature - About section pages and components.
 *
 * @example
 * // Lazy load in App.tsx
 * const AboutLandingPage = lazy(() => import('./features/about/pages/AboutLandingPage'));
 */

// Page exports for lazy loading
export { default as AboutLandingPage } from './pages/AboutLandingPage';
export { default as InitiativePage } from './pages/InitiativePage';
export { default as HowItWorksPage } from './pages/HowItWorksPage';
export { default as LeadershipPage } from './pages/LeadershipPage';
export { default as PartnersPage } from './pages/PartnersPage';
export { default as PrivacyPage } from './pages/PrivacyPage';

// Component exports
export * from './components';
