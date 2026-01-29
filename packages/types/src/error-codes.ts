/**
 * Error code constants for ODK Token Management (Story 2-4)
 * Per ADR-006: Defense-in-depth security requires consistent error codes.
 */

// ODK Token Error Codes
export const ODK_TOKEN_NOT_FOUND = 'TOKEN_NOT_FOUND';
export const ODK_TOKEN_ACCESS_DENIED = 'TOKEN_ACCESS_DENIED';
export const ODK_TOKEN_DECRYPTION_ERROR = 'TOKEN_DECRYPTION_ERROR';
export const ODK_CONFIG_ERROR = 'ODK_CONFIG_ERROR';

// Type for ODK error codes
export type OdkTokenErrorCode =
  | typeof ODK_TOKEN_NOT_FOUND
  | typeof ODK_TOKEN_ACCESS_DENIED
  | typeof ODK_TOKEN_DECRYPTION_ERROR
  | typeof ODK_CONFIG_ERROR;
