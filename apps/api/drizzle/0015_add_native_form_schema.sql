-- Add native form columns to questionnaire_forms
ALTER TABLE questionnaire_forms
  ADD COLUMN IF NOT EXISTS form_schema JSONB,
  ADD COLUMN IF NOT EXISTS is_native BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS native_published_at TIMESTAMP WITH TIME ZONE;

-- GIN index for efficient JSONB queries (AC2.7.1)
CREATE INDEX IF NOT EXISTS idx_questionnaire_forms_form_schema
  ON questionnaire_forms USING GIN (form_schema);
