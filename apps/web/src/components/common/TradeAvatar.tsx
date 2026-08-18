import {
  Hammer,
  Wrench,
  Scissors,
  Wheat,
  Laptop,
  HeartPulse,
  GraduationCap,
  Palette,
  Truck,
  Store,
  Mountain,
  Factory,
  UtensilsCrossed,
  Music,
  ShieldCheck,
  Recycle,
  Users,
  Zap,
  Anchor,
  Building2,
  Briefcase,
  type LucideIcon,
} from 'lucide-react';
import { skillSectorForSlug } from '@oslsr/types';

/**
 * TradeAvatar — Story 13-38 AC5.
 *
 * The card's warmth, with ZERO PII. `/marketplace` browse is public and
 * unauthenticated, so the locked design carries no name and no photo (scraper
 * defence); a trade glyph on a deterministic colour tile gives each worker a
 * distinct, recognisable identity tile instead.
 *
 * SHARED on purpose (`components/common/`, not `features/marketplace/`): the same
 * person must look identical on the card, the profile page and the registry table.
 *
 * - glyph  = the Appendix-C SECTOR of the worker's top skill (20 sectors + fallback),
 *            via the canonical `skillSectorForSlug` — never a second skill→icon
 *            vocabulary that could drift from the taxonomy (Story 13-22's lesson).
 * - colour = deterministic from the profile `id`, so it is stable across renders,
 *            pages and sessions without storing anything.
 */

/** One glyph per Appendix-C sector (`SKILL_SECTORS`), plus a generic fallback. */
const GLYPH_BY_SECTOR: Record<string, LucideIcon> = {
  'Construction & Building': Hammer,
  'Automotive & Mechanical': Wrench,
  'Fashion, Beauty & Personal Care': Scissors,
  'Food, Agriculture & Processing': Wheat,
  'Digital, Technology & Office': Laptop,
  'Healthcare & Wellness': HeartPulse,
  'Education & Professional Services': GraduationCap,
  'Artisan & Traditional Crafts': Palette,
  'Transport & Logistics': Truck,
  'Sales & Commerce': Store,
  'Mining & Quarrying': Mountain,
  'Manufacturing & Industrial': Factory,
  'Hospitality & Tourism': UtensilsCrossed,
  'Entertainment & Creative Arts': Music,
  'Security & Safety Services': ShieldCheck,
  'Waste Management & Environmental': Recycle,
  'Religious & Community Services': Users,
  'Energy & Utilities': Zap,
  'Marine & Waterway Services': Anchor,
  'Real Estate & Property Services': Building2,
};

/**
 * Tile colours. Each is dark enough for a white glyph to clear WCAG AA
 * non-text contrast, and they read as one family with the maroon brand
 * (#9C1E23) rather than a random hue wheel.
 */
const TILE_COLORS = [
  '#2E7D74',
  '#B7862B',
  '#8A3B6B',
  '#C1543A',
  '#4A55A2',
  '#6B7A2E',
  '#255E6A',
  '#7C4A2D',
] as const;

/** Stable non-cryptographic hash — same id always picks the same tile. */
function hashToIndex(seed: string, buckets: number): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % buckets;
}

export function glyphForSkill(skillSlug: string | null | undefined): LucideIcon {
  if (!skillSlug) return Briefcase;
  return GLYPH_BY_SECTOR[skillSectorForSlug(skillSlug)] ?? Briefcase;
}

export function tileColorForId(id: string): string {
  return TILE_COLORS[hashToIndex(id, TILE_COLORS.length)];
}

interface TradeAvatarProps {
  /** Stable identifier — drives the tile colour. */
  id: string;
  /** The worker's top skill slug; picks the glyph via its sector. */
  skillSlug?: string | null;
  /** Tile edge in px (default 52 — the card size from the locked design). */
  size?: number;
  className?: string;
}

export function TradeAvatar({ id, skillSlug, size = 52, className = '' }: TradeAvatarProps) {
  const Glyph = glyphForSkill(skillSlug);
  const background = tileColorForId(id);

  return (
    <span
      data-testid="trade-avatar"
      // The glyph is decorative: the trade it depicts is already the card's
      // identity line as text, so announcing it again is noise for a screen
      // reader. Hence aria-hidden rather than an img role + label.
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-xl shadow-sm ${className}`}
      style={{ width: size, height: size, backgroundColor: background }}
    >
      <Glyph className="text-white" style={{ width: size * 0.5, height: size * 0.5 }} strokeWidth={1.7} />
    </span>
  );
}
