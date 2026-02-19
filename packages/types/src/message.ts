/**
 * Message types for team messaging.
 *
 * Created in Story 4.2 (In-App Team Messaging).
 * Used by messaging service, controller, and frontend hooks.
 */

// ── Enums / Union Types ──────────────────────────────────────────────────

export const messageTypes = ['direct', 'broadcast'] as const;
export type MessageType = typeof messageTypes[number];
