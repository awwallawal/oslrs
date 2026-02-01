/**
 * Layout Components - Page layout wrappers
 *
 * These layouts follow ADR-016 Layout Architecture:
 * - PublicLayout: Homepage, About, Marketplace, Support pages
 * - AuthLayout: Login, Register, Password reset pages
 * - DashboardLayout: Role-based authenticated dashboards (Story 2.5-1)
 *
 * @example
 * import { PublicLayout, AuthLayout, DashboardLayout } from '@/layouts';
 */

export { PublicLayout } from './PublicLayout';
export { AuthLayout } from './AuthLayout';
export { DashboardLayout } from './DashboardLayout';
