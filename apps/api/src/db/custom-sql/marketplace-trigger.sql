-- GIN index for full-text search on marketplace_profiles.search_vector
-- (Drizzle 0.30.x does not support .using('gin') on index builder)
CREATE INDEX IF NOT EXISTS idx_marketplace_search_vector
ON marketplace_profiles USING gin(search_vector);

-- Marketplace search vector trigger
-- Auto-updates search_vector tsvector column on INSERT/UPDATE.
-- Weights: A=business_name + profession, B=skills, C=lga_name,
--          D=experience_level + association_name
-- Source: prep-4 marketplace data model spike, Section 2.2
--
-- Story 13-58 R5 (Awwal's ruling 2026-09-09) — `association_name` joined the vector
-- at weight D. The card says "AFAN — confirmed member" and, until this, typing
-- "AFAN" into the search box returned ZERO rows: search matches
-- `search_vector @@ plainto_tsquery` as a hard WHERE filter, so a term absent from
-- the vector is not merely ranked low, it is unfindable. The badge created an
-- expectation the search box then denied.
--
-- ⚠️ WEIGHT D, NOT A, AND THE REASON IS HONESTY RATHER THAN TASTE. `business_name`
-- earned 'A' because the card LEADS with it. An association name is a DISCLOSURE,
-- not a headline: it says who vouched, never what the worker does. At weight A or B
-- a body whose name contains a trade word ("ASNAT Tiler Association") would let all
-- 56 of its members outrank actual tilers on a search for "tiler". At D they rank
-- below every real practitioner.
--
-- ⛔ WHAT WEIGHT CANNOT FIX, stated so nobody assumes it did: matching is a hard
-- WHERE, so such a member still MATCHES "tiler" — ranked last, but present. Today's
-- stored values are the acronyms AFAN and ASNAT, so this is latent, not live. If
-- trade words ever enter association names, the answer is the structured
-- `?association=` filter (shipped alongside this) or excluding the name from the
-- vector — NOT a weight tweak, which cannot change a binary match.
--
-- ⚠️ SEQUENCING, and it is why this shipped now rather than later. The trigger
-- recomputes only on INSERT or UPDATE. Landing this BEFORE the 13-58 R2 catch-up
-- runs means R2's own UPDATEs populate the vector for exactly the rows that gain a
-- name, and the 8,278 imported profiles get theirs on INSERT when the gate opens —
-- so NO recompute sweep is ever needed. Landed AFTER R2, those rows are already
-- written and the backfill is idempotent (`needsUpdate=0`, writes nothing), so their
-- vectors would stay stale permanently. That is the ordering trap described below,
-- and R5 was closed inside the window rather than after it.
--
-- Story 13-38 AC8 / [AI-Review][Medium] 2026-08-18 — business_name joined the
-- vector at weight A. The redesigned card LEADS with the trading name, so it is the
-- string an employer reads and then types into the search box; leaving it out meant
-- the most prominent line on the card was the one thing search could not find. It
-- shares weight A with profession because both are the worker's headline identity.
--
-- ⚠️ APPLIED AUTOMATICALLY — `scripts/migrate-custom-sql-init.ts` runs this file on
-- every deploy and in CI (`db:push:full:force` auto-discovers it). Before Story
-- 13-38's review that wiring did not exist: this file was reachable only through a
-- manual `pnpm --filter @oslsr/api db:custom`, which appeared in NO workflow and NO
-- deploy step, so a change here shipped as dead code and the CI test DB never had
-- the trigger at all.
--
-- ⚠️ ORDERING — the claim "rows that gain a business_name refresh their own vector"
-- is TRUE ONLY IF THIS FILE IS APPLIED FIRST. The trigger recomputes on INSERT or
-- UPDATE only, and the 13-38 backfill is idempotent (a second run reports
-- needsUpdate=0 and writes nothing). So a row written while the trigger was stale
-- keeps a stale vector permanently — unfindable by trading name, since search
-- matches `search_vector @@ plainto_tsquery` as a hard WHERE filter. Deploy-time
-- placement is what makes that ordering structural. Recovery, if it ever does go
-- out of order, is in docs/runbooks/backfill-operator-residuals.md.

CREATE OR REPLACE FUNCTION update_marketplace_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.business_name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.profession, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.skills, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.lga_name, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.experience_level, '')), 'D') ||
    setweight(to_tsvector('english', COALESCE(NEW.association_name, '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate trigger to ensure latest version
DROP TRIGGER IF EXISTS marketplace_search_vector_update ON marketplace_profiles;

CREATE TRIGGER marketplace_search_vector_update
BEFORE INSERT OR UPDATE ON marketplace_profiles
FOR EACH ROW
EXECUTE FUNCTION update_marketplace_search_vector();
