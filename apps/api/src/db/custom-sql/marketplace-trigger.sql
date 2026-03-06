-- GIN index for full-text search on marketplace_profiles.search_vector
-- (Drizzle 0.30.x does not support .using('gin') on index builder)
CREATE INDEX IF NOT EXISTS idx_marketplace_search_vector
ON marketplace_profiles USING gin(search_vector);

-- Marketplace search vector trigger
-- Auto-updates search_vector tsvector column on INSERT/UPDATE.
-- Weights: A=profession, B=skills, C=lga_name, D=experience_level
-- Source: prep-4 marketplace data model spike, Section 2.2

CREATE OR REPLACE FUNCTION update_marketplace_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.profession, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.skills, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.lga_name, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.experience_level, '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate trigger to ensure latest version
DROP TRIGGER IF EXISTS marketplace_search_vector_update ON marketplace_profiles;

CREATE TRIGGER marketplace_search_vector_update
BEFORE INSERT OR UPDATE ON marketplace_profiles
FOR EACH ROW
EXECUTE FUNCTION update_marketplace_search_vector();
