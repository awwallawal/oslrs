-- Rename ODK-era column names to generic names
-- ODK Central was removed per SCP-2026-02-05-001; these columns
-- now serve the native form submission system.

ALTER TABLE submissions
  RENAME COLUMN odk_submission_id TO submission_uid;

ALTER TABLE submissions
  RENAME COLUMN odk_submitter_id TO submitter_id;

-- Rename the index to match the new column name
ALTER INDEX submissions_odk_submission_id_idx
  RENAME TO submissions_submission_uid_idx;
