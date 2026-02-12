-- Backfill email_verified_at for existing active users (Story 3.0, Task 1.6)
-- These users already completed email verification, so we set emailVerifiedAt to their created_at time.
UPDATE users SET email_verified_at = created_at WHERE status = 'active' AND auth_provider = 'email' AND email_verified_at IS NULL;
