/**
 * View-As API Client — Story 6-7
 *
 * API functions for View-As session management and data proxy.
 */

import { apiClient } from '../../../lib/api-client';

export interface ViewAsSession {
  active: boolean;
  targetRole?: string;
  targetLgaId?: string | null;
  startedAt?: string;
  expiresAt?: string;
  duration?: number;
}

export interface ViewAsDashboardCard {
  label: string;
  value: number | string;
  description?: string;
}

export interface ViewAsDashboardSummary {
  role: string;
  lgaId: string | null;
  cards: ViewAsDashboardCard[];
  recentActivity: Array<{ label: string; timestamp: string }>;
}

export interface StartViewAsRequest {
  targetRole: string;
  targetLgaId?: string;
  reason?: string;
}

/** POST /view-as/start — Start a View-As session */
export async function startViewAs(data: StartViewAsRequest): Promise<ViewAsSession> {
  const result = await apiClient('/view-as/start', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return result.data;
}

/** POST /view-as/end — End the current View-As session */
export async function endViewAs(): Promise<ViewAsSession> {
  const result = await apiClient('/view-as/end', { method: 'POST' });
  return result.data;
}

/** GET /view-as/current — Get current View-As state */
export async function getCurrentViewAs(): Promise<ViewAsSession> {
  const result = await apiClient('/view-as/current');
  return result.data;
}

/** GET /view-as/data/dashboard — Get dashboard data for the target role */
export async function getViewAsDashboardData(): Promise<ViewAsDashboardSummary> {
  const result = await apiClient('/view-as/data/dashboard');
  return result.data;
}

// Note: /view-as/data/sidebar endpoint exists on backend but frontend uses
// hardcoded SIDEBAR_MAP in ViewAsDashboardPage.tsx for instant rendering.
// If sidebar config becomes dynamic, add a hook consuming that endpoint.
