import { UserRole } from '@oslsr/types';
import type { JwtPayload } from '@oslsr/types';

/** Roles authorized for realtime transport connections */
export const REALTIME_ROLES: readonly UserRole[] = [
  UserRole.SUPERVISOR,
  UserRole.ENUMERATOR,
] as const;

/** Returns the LGA-scoped room name for a given LGA ID */
export function getRoomName(lgaId: string): string {
  return `lga:${lgaId}`;
}

/**
 * Checks whether a user is authorized to join a specific room.
 * Requires: correct role (supervisor or enumerator) AND matching LGA.
 */
export function canJoinRoom(user: JwtPayload, roomName: string): boolean {
  // Must have an LGA assigned
  if (!user.lgaId) {
    return false;
  }

  // Must be an authorized role
  if (!REALTIME_ROLES.includes(user.role)) {
    return false;
  }

  // Room must match user's LGA
  const userRoom = getRoomName(user.lgaId);
  return roomName === userRoom;
}
