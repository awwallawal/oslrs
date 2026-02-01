/**
 * Application Constants
 *
 * Centralized constants for the OSLSR web application.
 * Import from '@/lib/constants' in components.
 */

// Declare the build-time injected version variable
declare const __APP_VERSION__: string;

/**
 * Application version - injected at build time from package.json
 * Falls back to '0.0.0' in development/test environments where define may not be available
 */
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0';

/**
 * Layout dimensions (in Tailwind units and pixels)
 *
 * These values ensure consistency between:
 * - Desktop sidebar width
 * - Mobile sheet width
 * - Header heights
 */
export const LAYOUT = {
  /** Desktop sidebar width: 240px (Tailwind: w-60) */
  SIDEBAR_WIDTH: 240,
  SIDEBAR_WIDTH_CLASS: 'w-60',

  /** Tablet sidebar width (collapsed): 72px (Tailwind: w-[72px]) */
  SIDEBAR_COLLAPSED_WIDTH: 72,
  SIDEBAR_COLLAPSED_WIDTH_CLASS: 'w-[72px]',

  /** Mobile navigation sheet width: 288px (Tailwind: w-72) */
  MOBILE_SHEET_WIDTH: 288,
  MOBILE_SHEET_WIDTH_CLASS: 'w-72',

  /** Desktop header height: 64px (Tailwind: h-16) */
  HEADER_HEIGHT_DESKTOP: 64,
  HEADER_HEIGHT_DESKTOP_CLASS: 'h-16',

  /** Mobile header height: 56px (Tailwind: h-14) */
  HEADER_HEIGHT_MOBILE: 56,
  HEADER_HEIGHT_MOBILE_CLASS: 'h-14',

  /** Mobile bottom nav height: 56px (Tailwind: h-14) */
  BOTTOM_NAV_HEIGHT: 56,
  BOTTOM_NAV_HEIGHT_CLASS: 'h-14',
} as const;
