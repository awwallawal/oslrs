-- Rename ODK-era column form_xml_id to questionnaire_form_id
-- Clarifies that this column stores the questionnaire_forms.id UUID, not an XML form ID
-- See: L2 review finding from Story 3.4 code review

ALTER TABLE "submissions"
  RENAME COLUMN "form_xml_id" TO "questionnaire_form_id";

-- Rename the index to match the new column name
ALTER INDEX "submissions_form_xml_id_idx"
  RENAME TO "submissions_questionnaire_form_id_idx";
