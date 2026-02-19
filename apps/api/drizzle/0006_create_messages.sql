-- Story 4.2: Create messages and message_receipts tables for team messaging
-- Supports supervisor ↔ enumerator direct messaging and supervisor broadcasts

CREATE TABLE IF NOT EXISTS "messages" (
  "id" uuid PRIMARY KEY,
  "sender_id" uuid NOT NULL REFERENCES "users"("id"),
  "recipient_id" uuid REFERENCES "users"("id"),
  "lga_id" uuid NOT NULL REFERENCES "lgas"("id"),
  "message_type" text NOT NULL CHECK ("message_type" IN ('direct', 'broadcast')),
  "content" text NOT NULL,
  "sent_at" timestamp with time zone DEFAULT now() NOT NULL,
  "is_seeded" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_messages_sender_id" ON "messages" ("sender_id");
CREATE INDEX IF NOT EXISTS "idx_messages_recipient_id" ON "messages" ("recipient_id");
CREATE INDEX IF NOT EXISTS "idx_messages_lga_id" ON "messages" ("lga_id");
CREATE INDEX IF NOT EXISTS "idx_messages_sent_at" ON "messages" ("sent_at");

CREATE TABLE IF NOT EXISTS "message_receipts" (
  "id" uuid PRIMARY KEY,
  "message_id" uuid NOT NULL REFERENCES "messages"("id"),
  "recipient_id" uuid NOT NULL REFERENCES "users"("id"),
  "delivered_at" timestamp with time zone,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_message_receipts_message_id" ON "message_receipts" ("message_id");
CREATE INDEX IF NOT EXISTS "idx_message_receipts_recipient_id" ON "message_receipts" ("recipient_id");

-- Partial index for efficient unread count queries
CREATE INDEX IF NOT EXISTS "idx_message_receipts_unread"
  ON "message_receipts" ("recipient_id")
  WHERE read_at IS NULL;
