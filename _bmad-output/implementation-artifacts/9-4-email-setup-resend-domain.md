# Story 9.4: Email Setup — Resend Domain Verification & Human-Facing Email

Status: deferred

> **2026-04-05 — Scope Update:** This story is entirely ops/configuration work — no code changes.
> Story 9-5 centralized all domain references to env vars, so this story's scope is UNCHANGED.
> When domain is purchased, merge with Story 9-2 remaining tasks (static files, docs, VPS runbook)
> into a single migration story. All tasks below remain valid as-is.
> **Migration runbook:** `docs/DOMAIN-MIGRATION.md` — the single checklist to follow on migration day.

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the **Super Admin**,
I want **transactional emails sent from `noreply@oslrs.com` via Resend with proper DNS authentication, and human-facing email addresses (`admin@oslrs.com`, `support@oslrs.com`) set up for correspondence**,
so that **emails are delivered reliably (not flagged as spam), recipients see a professional sender domain, and there are reachable addresses for support and admin communication**.

## Acceptance Criteria

1. **AC#1 — Resend domain verified:** `oslrs.com` is added and verified in the Resend dashboard. SPF, DKIM (3 CNAME records), and MX (for bounce handling) DNS records are configured at the domain registrar and passing Resend's verification checks.

2. **AC#2 — Transactional emails work:** A test staff invitation email sent via `POST /api/v1/dev/email-preview/staff-invitation` (or production trigger) is delivered successfully from `noreply@oslrs.com`. The email arrives in inbox (not spam), with correct DKIM/SPF signatures visible in email headers.

3. **AC#3 — Production env vars updated:** VPS `.env` updated with:
   - `EMAIL_PROVIDER=resend`
   - `EMAIL_FROM_ADDRESS=noreply@oslrs.com`
   - `EMAIL_FROM_NAME=Oyo State Labour & Skills Registry`
   - `RESEND_API_KEY=re_...` (new key for oslrs.com domain)
   - `EMAIL_TIER=free` (or upgraded tier if needed)

4. **AC#4 — Human-facing email configured:** At least one of these approaches is operational:
   - **Option A (Zoho Mail free):** `admin@oslrs.com` and `support@oslrs.com` mailboxes created via Zoho Mail free tier (up to 5 users)
   - **Option B (Cloudflare Email Routing):** `admin@oslrs.com` and `support@oslrs.com` forwarded to Awwal's personal inbox
   - **Option C (Other):** Per Awwal's preference

   Awwal can send/receive from these addresses.

5. **AC#5 — ActivationWizard support email updated:** `ActivationWizard.tsx` `mailto:` link points to the live `support@oslrs.com` address (or whichever address is configured in AC#4). This is a code change — covered in Story 9-2 but verified here.

6. **AC#6 — Documentation updated:** `docs/RESEND-SETUP.md` reflects the new domain, DNS records, and any provider-specific setup steps for human-facing email. Include the exact DNS records added for future reference.

7. **AC#7 — DMARC record added:** A DMARC DNS record is published for `oslrs.com` to prevent domain spoofing. At minimum: `v=DMARC1; p=quarantine; rua=mailto:admin@oslrs.com` as a TXT record on `_dmarc.oslrs.com`.

## Prerequisites / Blockers

- **BLOCKING:** Domain `oslrs.com` must be purchased and DNS must be accessible (depends on Story 9-2 DNS setup).
- **BLOCKING:** Story 9-2 (domain migration) should be deployed first so code references `noreply@oslrs.com`.
- **Awwal must confirm:** Human-facing email preference — Zoho Mail free, Cloudflare Email Routing, or other?
- **Awwal must confirm:** Which tier for Resend — stay on `free` (3K/mo, 100/day) or upgrade?

## Tasks / Subtasks

- [ ] Task 1: Add oslrs.com domain to Resend (AC: #1)
  - [ ] 1.1 Log into Resend dashboard → Domains → Add Domain → Enter `oslrs.com`
  - [ ] 1.2 Resend will provide DNS records to add. Copy them.
  - [ ] 1.3 Typical records Resend requires:
    - SPF: TXT record on `oslrs.com` → `v=spf1 include:_spf.resend.com ~all`
    - DKIM: 3 CNAME records (Resend provides exact values)
    - MX: MX record for bounce handling (Resend provides)
  - [ ] 1.4 Add all records at domain registrar (Namecheap, Cloudflare, or wherever oslrs.com is registered)
  - [ ] 1.5 Wait for DNS propagation (usually 1-24 hours, up to 48)
  - [ ] 1.6 Click "Verify" in Resend dashboard — confirm all checks pass (green checkmarks)

- [ ] Task 2: Generate new Resend API key (AC: #3)
  - [ ] 2.1 In Resend dashboard → API Keys → Create Key
  - [ ] 2.2 Name: `oslrs-production`
  - [ ] 2.3 Permission: "Sending access" (not Full — principle of least privilege)
  - [ ] 2.4 Domain restriction: `oslrs.com` only
  - [ ] 2.5 Copy the key (starts with `re_`) — it's shown only once

- [ ] Task 3: Update VPS environment variables (AC: #3)
  - [ ] 3.1 SSH into VPS
  - [ ] 3.2 Edit `.env` — update email-related vars:
    ```
    EMAIL_PROVIDER=resend
    EMAIL_ENABLED=true
    RESEND_API_KEY=re_new_key_here
    EMAIL_FROM_ADDRESS=noreply@oslrs.com
    EMAIL_FROM_NAME=Oyo State Labour & Skills Registry
    EMAIL_TIER=free
    ```
  - [ ] 3.3 Restart the API process: `pm2 restart oslsr-api`
  - [ ] 3.4 Verify in logs: `pnpm pm2 logs oslsr-api --lines 20` — confirm Resend provider initializes without errors

- [ ] Task 4: Test transactional email delivery (AC: #2)
  - [ ] 4.1 Trigger a test email (staff invitation or password reset) to a real inbox
  - [ ] 4.2 Verify email arrives in inbox (not spam folder)
  - [ ] 4.3 Inspect email headers — confirm DKIM and SPF pass:
    - `dkim=pass`
    - `spf=pass`
  - [ ] 4.4 Verify sender shows as `noreply@oslrs.com`
  - [ ] 4.5 Verify links in email use `https://oslrs.com/...` (not old domain)
  - [ ] 4.6 Check Resend dashboard → Logs — confirm delivery status

- [ ] Task 5: Add DMARC DNS record (AC: #7)
  - [ ] 5.1 Add TXT record at domain registrar:
    - Host: `_dmarc.oslrs.com` (or `_dmarc` depending on registrar)
    - Value: `v=DMARC1; p=quarantine; rua=mailto:admin@oslrs.com`
  - [ ] 5.2 Verify via `dig _dmarc.oslrs.com TXT` or online DMARC checker

- [ ] Task 6: Set up human-facing email (AC: #4)
  - [ ] 6.1 Confirm Awwal's preference: Zoho Mail free, Cloudflare forwarding, or other
  - [ ] 6.2 **If Zoho Mail free:**
    - Sign up at zoho.com/mail → Add domain `oslrs.com`
    - Add Zoho MX records to DNS (may conflict with Resend MX — use subdomain strategy if needed)
    - Create mailboxes: `admin@oslrs.com`, `support@oslrs.com`
    - Note: Zoho free = 5 users, 5GB/user, web-only access
  - [ ] 6.3 **If Cloudflare Email Routing:**
    - DNS must be on Cloudflare (proxy)
    - Enable Email Routing → Add routes:
      - `admin@oslrs.com` → Awwal's personal email
      - `support@oslrs.com` → Awwal's personal email
    - No MX conflict with Resend (Cloudflare handles routing separately)
    - Limitation: Can only receive/forward, cannot send FROM these addresses (use "reply-to" workaround)
  - [ ] 6.4 Test: Send email to `admin@oslrs.com` — verify it arrives

- [ ] Task 7: Update documentation (AC: #6)
  - [ ] 7.1 Update `docs/RESEND-SETUP.md`:
    - Change domain examples from `oyotradeministry.com.ng` to `oslrs.com`
    - Add the exact DNS records that were configured
    - Document which human-facing email provider was chosen
    - Add DMARC setup instructions
  - [ ] 7.2 Update `docs/infrastructure-cicd-playbook.md` if it references email setup

- [ ] Task 8: Verify AC#5 — support email in codebase (AC: #5)
  - [ ] 8.1 Confirm `ActivationWizard.tsx` mailto link was updated in Story 9-2 to `support@oslrs.com`
  - [ ] 8.2 If Story 9-2 hasn't been deployed yet, note this as a dependency

## Dev Notes

### This is Primarily a Configuration Story

Unlike most stories, this one involves **zero application code changes**. All code-level domain replacements are handled in Story 9-2. This story is purely:
- DNS record configuration at domain registrar
- Resend dashboard operations
- VPS `.env` updates
- Human-facing email provider setup
- Documentation updates

### Email Architecture (Already Built)

The email system is fully operational with these components:

| Component | File | Purpose |
|-----------|------|---------|
| Email Service | `apps/api/src/services/email.service.ts` | 7 email types, HTML+text templates |
| Resend Provider | `apps/api/src/providers/resend.provider.ts` | Resend SDK integration |
| Mock Provider | `apps/api/src/providers/mock-email.provider.ts` | Dev/test stub |
| Config Factory | `apps/api/src/providers/index.ts` | Provider resolution from env |
| Email Config | `packages/config/src/email.ts` | Tier limits, Redis keys, queue config |
| Email Queue | `apps/api/src/queues/email.queue.ts` | BullMQ queue with dedup + deferred digests |
| Email Worker | `apps/api/src/workers/email.worker.ts` | Concurrency 5, backoff, budget checks |
| Budget Service | `apps/api/src/services/email-budget.service.ts` | Daily/monthly tracking, overage |
| Types | `packages/types/src/email.ts` | All interfaces and job types |

### Email Types Currently in Production

| Type | Priority | Template |
|------|----------|----------|
| Staff Invitation | Critical | Role + LGA + activation link (24h) |
| Email Verification | Critical | Magic link (24h) + OTP (10m) |
| Password Reset | Critical | Reset link (1h) |
| Duplicate Registration | Standard | Security alert |
| Payment Notification | Standard | Amount + tranche + bank ref |
| Dispute Notification | Standard | Staff dispute alert to admin |
| Dispute Resolution | Standard | Admin response to staff |
| Backup Notification | Standard | System alert |

### DNS Record Checklist

After adding `oslrs.com` to Resend, you'll need these DNS records:

| Type | Host | Value | Purpose |
|------|------|-------|---------|
| TXT | `oslrs.com` | `v=spf1 include:_spf.resend.com ~all` | SPF — authorize Resend to send |
| CNAME | (Resend provides) | (Resend provides) | DKIM signature 1 |
| CNAME | (Resend provides) | (Resend provides) | DKIM signature 2 |
| CNAME | (Resend provides) | (Resend provides) | DKIM signature 3 |
| MX | `oslrs.com` | (Resend provides) | Bounce handling |
| TXT | `_dmarc.oslrs.com` | `v=DMARC1; p=quarantine; rua=mailto:admin@oslrs.com` | Anti-spoofing |

**Important:** If using Zoho Mail for human-facing email, MX records may conflict. Solutions:
- Use Cloudflare Email Routing instead (no MX conflict)
- Or set Resend return-path to a subdomain (`bounces.oslrs.com`)

### Resend Tier Decision

| Tier | Cost | Monthly Limit | Daily Limit | Recommendation |
|------|------|---------------|-------------|----------------|
| Free | $0 | 3,000 | 100 | Sufficient for current ~60 active staff |
| Pro | $20/mo | 50,000 | Unlimited | Needed if bulk invitations exceed 100/day |
| Scale | $90/mo | 100,000 | Unlimited | Overkill for current scale |

Current usage is low. **Free tier is fine** unless a bulk staff import exceeds 100 invitations in one day (which the budget service already handles by splitting across days).

### Env Var Safety (CRITICAL)

Per SEC-3 crash loop lesson and project deployment patterns:
- Update `.env` on VPS **BEFORE** deploying any code that references the new domain
- Specifically: `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS` must be set before code deploy
- If deploying Story 9-2 and 9-4 together, set env vars first, then deploy code, then verify

### Rollback Plan

If email delivery fails after switching to `oslrs.com`:
1. Revert `EMAIL_FROM_ADDRESS` to `noreply@oyotradeministry.com.ng` in VPS `.env`
2. Restart API: `pm2 restart oslsr-api`
3. Old Resend domain verification should still be active
4. Debug DNS records and re-attempt

### References

- [Source: `_bmad-output/implementation-artifacts/polish-and-migration-plan-2026-03-14.md` — Section 4]
- [Source: `docs/RESEND-SETUP.md` — complete Resend setup guide]
- [Source: `apps/api/src/services/email.service.ts` — email service with 7 templates]
- [Source: `apps/api/src/providers/resend.provider.ts` — Resend SDK integration]
- [Source: `packages/config/src/email.ts` — tier limits, budget config]
- [Source: `apps/api/src/queues/email.queue.ts` — BullMQ queue with dedup + digest]
- [Source: `apps/api/src/workers/email.worker.ts` — worker with budget-aware throttling]
- [Source: `_bmad-output/implementation-artifacts/9-2-domain-migration-oslrs-com.md` — code-level domain changes]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### Change Log

### File List
