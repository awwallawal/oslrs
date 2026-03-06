/**
 * Marketplace Types
 *
 * Type definitions for the public skills marketplace.
 * Created in Story 7.1, design source: prep-4 spike Section 5.
 */

// ============================================================================
// Marketplace Profile Types
// ============================================================================

/** Anonymous profile view — visible to all public visitors */
export interface MarketplaceProfileAnonymous {
  id: string;
  profession: string | null;
  skills: string | null;
  lgaName: string | null;
  experienceLevel: string | null;
  verifiedBadge: boolean;
  bio: string | null;
  portfolioUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Enriched profile view — visible after auth + CAPTCHA + consent check */
export interface MarketplaceProfileEnriched extends MarketplaceProfileAnonymous {
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string | null;
  consentEnriched: true;
}

/** Union type for profile responses */
export type MarketplaceProfileView = MarketplaceProfileAnonymous | MarketplaceProfileEnriched;

/** Profile detail view — full anonymous profile for /marketplace/profiles/:id (Story 7-3) */
export interface MarketplaceProfileDetail {
  id: string;
  profession: string | null;
  lgaName: string | null;
  experienceLevel: string | null;
  verifiedBadge: boolean;
  bio: string | null;
  portfolioUrl: string | null;
  createdAt: string;
}

// ============================================================================
// Search Types (cursor-based pagination — Story 7-2)
// ============================================================================

/** Search request parameters (cursor-based pagination) */
export interface MarketplaceSearchParams {
  q?: string;
  lgaId?: string;
  profession?: string;
  experienceLevel?: string;
  cursor?: string;
  pageSize?: number;
}

/** Individual search result item — anonymous fields with optional relevance score */
export interface MarketplaceSearchResultItem {
  id: string;
  profession: string | null;
  lgaName: string | null;
  experienceLevel: string | null;
  verifiedBadge: boolean;
  bio: string | null;
  relevanceScore: number | null;
}

// ============================================================================
// Contact Reveal Types
// ============================================================================

/** Contact reveal log entry (matches contact_reveals schema) */
export interface ContactRevealEntry {
  id: string;
  viewerId: string;
  profileId: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

/** Contact reveal response — PII returned on successful reveal */
export interface ContactRevealResponse {
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string | null;
}

/** Contact reveal request body */
export interface ContactRevealRequest {
  captchaToken: string;
}

// ============================================================================
// Profile Enrichment Types (Edit Token — Story 7-5)
// ============================================================================

/** Payload for self-service profile enrichment via edit token */
export interface ProfileEnrichmentPayload {
  bio?: string;
  portfolioUrl?: string;
}

/** Edit token validation response */
export interface EditTokenValidation {
  valid: boolean;
  profileId?: string;
  expiresAt?: string;
}
