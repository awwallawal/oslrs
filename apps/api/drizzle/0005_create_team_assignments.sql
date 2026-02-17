-- prep-8: Create team_assignments table for supervisor-enumerator team relationships
-- Supports Story 4.1 (Supervisor Team Dashboard) and Story 4.2 (In-App Team Messaging)

CREATE TABLE IF NOT EXISTS "team_assignments" (
  "id" uuid PRIMARY KEY,
  "supervisor_id" uuid NOT NULL REFERENCES "users"("id"),
  "enumerator_id" uuid NOT NULL REFERENCES "users"("id"),
  "lga_id" uuid NOT NULL REFERENCES "lgas"("id"),
  "assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
  "unassigned_at" timestamp with time zone,
  "is_seeded" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_team_assignments_supervisor_id" ON "team_assignments" ("supervisor_id");
CREATE INDEX IF NOT EXISTS "idx_team_assignments_enumerator_id" ON "team_assignments" ("enumerator_id");
CREATE INDEX IF NOT EXISTS "idx_team_assignments_lga_id" ON "team_assignments" ("lga_id");

-- Partial unique: one enumerator can have only one active supervisor
CREATE UNIQUE INDEX IF NOT EXISTS "idx_team_assignments_active_enumerator"
  ON "team_assignments" ("enumerator_id")
  WHERE unassigned_at IS NULL;
