# Consumer Onboarding SOP — OSLRS Partner-API Programme

**Version:** v1.1 (Iris + Awwal draft incorporating Gabe documentation review + R2 adversarial-review findings)
**Status:** PENDING-RATIFICATION — paired with `dsa-template-v1-signoff.md`
**Owners:** Iris (DPIA / NDPA) + Awwal (Builder, until Transfer) + Ministry ICT (post-Transfer)
**Audience:** Super Admin operating the OSLRS Partner-API Programme; Ministry ICT inheriting at Transfer; downstream Partner (read-only reference)

## Change Log

| Version | Date | Author | Summary |
|---|---|---|---|
| v1 | 2026-05-03 | Iris + Awwal (draft) | Initial 8-step SOP + token-delivery acceptance criteria |
| v1.1 | 2026-05-03 | Iris + Awwal + R2 reviewer | Token-delivery channel moved to STEP 1; explicit `received`→`in-review` transition; sensitive-track operational definition; STEP 3 pre-render placeholder check; STEP 4 escalation thresholds tightened; STEP 5 prerequisites preamble; STEP 7 manual psql fallback for pre-Story-10-6 era; STEP 7.5 Mid-Term PII Re-affirmation; tracker = canonical (calendar reminder = secondary) |

---

## Purpose

This SOP operationalises the Data-Sharing Agreement (`data-sharing-agreement-template-v1.md`) and the architectural decision in `_bmad-output/planning-artifacts/architecture.md` Decision 3.4 + ADR-019. It walks a Super Admin through the seven-step onboarding workflow from "request received" to "Partner active in production", and through the recurring quarterly review + annual renewal + termination procedures.

It is **not** a substitute for the DSA: where this SOP and the DSA conflict, the DSA prevails.

## Scope

In scope:
- Onboarding any external organisation (Federal MDA, State MDA, Cooperative, contracted analytics vendor) as a Partner-API consumer
- Provisioning, rotating, and revoking API Keys
- Quarterly review and annual renewal cadence
- Termination procedure (either party initiated)

Out of scope:
- Partner-self-service onboarding (manual via Super Admin in MVP — see Story 10-3)
- Bilateral data-licensing agreements outside the Partner-API Programme
- Internal staff onboarding (covered by Story 1-3 staff provisioning)

## Roles

| Role | Responsibility |
|---|---|
| **Super Admin** | Day-to-day onboarding operator; runs all SOP steps; provisions keys; logs in tracker |
| **Ministry ICT Lead** | Second-person approver for `submissions:read_pii` scope provisioning (FR24 + Decision 3.4) |
| **Iris (DPIA / NDPA)** | DSA legal authority; updates Appendix H; reviews any non-default lawful basis |
| **Gabe (legal review)** | Reviews partner-supplied DSA variants; reviews Schedule changes affecting governing law / dispute resolution |
| **Partner Authorised Signatory** | Counter-signs DSA on behalf of Partner organisation |

---

## STEP 1 — Request Received

**Trigger:** Partner submits an access request via:
- Self-service form on `/developers` (Story 10-4), OR
- Direct email to `support@oyoskills.com`, OR
- In-person letter to Ministry HQ.

**Action:**
1. Super Admin opens `docs/legal/consumer-onboarding-tracker.md`. Add a row with:
   - **request_id** — sequential, format `CON-YYYYMMDD-NNN`
   - **partner_org** — partner organisation legal name as stated
   - **contact_email** — partner's stated contact
   - **requested_scopes** — as stated by partner (subject to STEP 2 review)
   - **requested_lga_scope** — list of LGA codes, or "all" if Partner is multi-LGA
   - **status** = `received`
   - **notes** — channel of receipt; any flags
2. Acknowledge receipt to Partner within **2 business days** with a brief expected-timeline message; the acknowledgement email collects the **Token-Delivery Channel preference** (DSA Schedule 3 §1) up front:
   - *"Please indicate ONE of: (a) Channel A — PGP-encrypted email; if A, reply with your PGP public-key fingerprint and the recipient email; OR (b) Channel B — in-person handoff at Ministry HQ; if B, reply with the proposed recipient name and a workable handoff date. If neither is workable for your organisation please reply explaining the constraint and we will discuss alternatives at STEP 2."*
   - Capture the response (or `pending`) in tracker `notes` so STEP 5 cannot deadlock at provisioning time.
3. **Closure of STEP 1.** When Super Admin sits down to begin STEP 2 eligibility review (whether same-day as STEP 1 or up to 3 business days later), the first action is to update the tracker row `status` field from `received` → `in-review`. This explicit transition prevents the row sitting opaquely in `received` while review is actually under way.

**Output:** tracker row in `received` state, channel-preference response captured (or noted as `pending`).
**Time budget:** ≤ 2 business days from receipt to acknowledgement.

---

## STEP 2 — Initial Eligibility Review (1–3 business days)

**Action:**
1. Super Admin reviews requested scopes against the Scope Catalogue (DSA Schedule 2 §3).
2. Decision tree:

   ```
   Requested scopes contain `submissions:read_pii`?
   ├── YES → PII-TRACK; full DSA workflow (STEPS 3–4); engage Iris for Appendix H DPIA section
   └── NO  → check if request includes `registry:verify_nin`?
            ├── YES → SENSITIVE-TRACK
            └── NO  → PUBLIC-TRACK (fast-track to STEP 5 with simplified Schedule 1 §2)
   ```

   **Per-track operational profile** (drives STEPs 3, 4, 5 timeline + approval requirements):

   | Track | STEP 3 budget | STEP 4 budget | Two-person Ministry approval (FR24) | Iris DPIA Appendix H section | Default rotation cadence |
   |---|---|---|---|---|---|
   | `public-track` | 1–2 business days | 3–5 business days | Not required (Super Admin only) | Not required | 180 days |
   | `sensitive-track` | 2–3 business days | 3–7 business days | Not required (Super Admin only) | Not required (NIN-verify scope; no PII payload returned) | 90 days |
   | `pii-track` | 3–5 business days | 5–15 business days | **Required** — Super Admin + Ministry ICT Lead | **Required** — new `§H.<N>` authored by Iris | 90 days max + < scope expiry per DSA Schedule 1 §1 |

3. Sanity checks (always):
   - Is partner organisation a recognised entity (MDA / registered Cooperative / verifiable Limited Company)?
   - Is the stated Purpose plausibly within OSLRS's lawful basis (NDPA s.6(1)(e) public interest)?
   - Are requested LGAs within Oyo State (the OSLRS scope)?
   - Are requested rate limits in line with the Partner's stated traffic profile?

4. If the request fails sanity checks, status → `rejected` with a reason note. Reply to Partner with the reason.

**Output:** tracker row in `in-review` (and either `pii-track` / `sensitive-track` / `public-track` flag) OR `rejected`.
**Time budget:** 1–3 business days.

---

## STEP 3 — DSA Drafting (3–5 business days)

**Required from Partner before this step starts** (collected by Super Admin via email):

| Input | Used in DSA Schedule |
|---|---|
| Organisation legal name + registration number | Parties block + §1 |
| Authorised signatory name + role | Signature block |
| Authorised witness name | Signature block |
| Technical contact email + phone | Schedule 3 §3 |
| Intended Purpose paragraph (1 paragraph) | Schedule 1 §1 |
| Requested LGA Scope (codes) | Schedule 1 §2 |
| IP allowlist (CIDR) | Schedule 1 §5 |
| Sub-processor list (if any) | Schedule 1 §7 |
| Cross-border transfer? (if yes, basis under NDPA s.41) | Schedule 1 §6 |
| Partner-conducted DPIA (if `submissions:read_pii`) — partner DPIA OR confirmation they accept Oyo's Appendix H | Recital E |

**Action:**
1. Super Admin populates DSA template Schedule 1 / 2 / 3 with Partner-specific values. Field placeholders documented in the DSA template.
2. **For `submissions:read_pii` track only:**
   - Iris is engaged to draft the per-Partner DPIA section in Baseline Report Appendix H. The section number assigned (`§H.<N>`) is recorded inline in DSA Recital E AND in DSA Schedule 1 §2 "PII scope additional requirements" "DPIA reference" line — both placeholders `[APPENDIX_H_SECTION_NUMBER]` must be replaced with the same concrete value (e.g. `H.9`).
   - Iris confirms NDPA s.26(1)(b) supplementary basis for NIN processing.
3. **Pre-render placeholder check (mandatory).** Before invoking pandoc, run:
   ```
   grep -nE '\[[A-Z_]+\]' docs/legal/data-sharing-agreement-template-v1.md
   ```
   The acceptable post-population matches are limited to the **Partner counter-signature placeholders** that the Partner fills at signature:
   - `[PARTNER_LEGAL_NAME]` (already populated at this point — should not appear)
   - `[PARTNER_SIGNATORY_NAME]`, `[PARTNER_SIGNATORY_ROLE]`, `[PARTNER_SIGNATURE_DATE]`, `[PARTNER_WITNESS_NAME]`
   - `[MINISTRY_SIGNATORY_NAME]`, `[MINISTRY_SIGNATORY_ROLE]`, `[MINISTRY_SIGNATURE_DATE]`, `[MINISTRY_WITNESS_NAME]`

   Every other placeholder (notably `[APPENDIX_H_SECTION_NUMBER]`, `[EFFECTIVE_DATE]`, `[FIRST_ISSUANCE_DATE]`, `[PURPOSE_PARAGRAPH]`, `[PARTNER_ADDRESS]`, `[PARTNER_REGISTRATION_NUMBER]`, `[PARTNER_LEGAL_FORM]`, `[NDPC_REG_NUMBER]`, `[Ministry HQ Address, Ibadan, Oyo State, Nigeria]`, `[PARTNER_IP_CIDR_LIST]`, `[NAME]`, `[PHONE]`, `[EMAIL]`, `[FINGERPRINT]`, `[DATE]`, `[METHOD — ...]`, `[CERTIFICATE_ID]`, `[VENDOR_NAME]`, `[COUNTRY/JURISDICTION]`, `[GROUND_AND_BASIS]`, `[APPROVAL_DATE]`, `[SUPER_ADMIN_NAME]`, `[ICT_LEAD_NAME]`, `[ISSUANCE_DATE]`, `[DESCRIBE]`) must be either populated or explicitly removed if not applicable to this Partner. **Do not proceed to pandoc render if any of the above is left as a literal `[PLACEHOLDER]` token.**
4. Render to `.docx` via pandoc (see DSA template rendering instructions).
5. Send drafted DSA to Partner for legal review.
6. Status → `dsa-drafted`; tracker row gets a `dsa_drafted_at` timestamp.

**Output:** Partner-specific DSA `.docx` in Partner's hands; tracker row in `dsa-drafted`.
**Time budget:** 3–5 business days from inputs received.

---

## STEP 4 — Partner Legal Review + Signature (5–15 business days)

**Action (Partner side):** Partner's legal team reviews the DSA. May raise questions, propose amendments, or counter with their own template.

**Action (Ministry side):**
1. Gabe reviews partner-proposed amendments for legal-equivalence with Iris's template.
2. Material amendments require Iris re-review (DPIA implications).
3. Iterate until both Parties agree.

**Two-person Ministry approval (required for `submissions:read_pii` scope per FR24 / Decision 3.4):**
- Super Admin signs off on technical fit (record in tracker `super_admin_approval_at`).
- Ministry ICT Lead signs off on PII access decision.
  - Captured in `audit_logs` with `action='dsa.pii_scope_approved'`, `actor_id=<ICT_LEAD_USER_ID>`.
- Both approvals must precede DSA signature.

**Signature:**
- DocuSign / Adobe Sign preferred; wet-ink + scan acceptable.
- Both Parties sign; signed PDF stored at `digitalocean://oslsr-media/legal/dsa-signed/<request_id>.pdf` (DigitalOcean Spaces under existing S3 SDK config).
- URL recorded in tracker as `dsa_signed_url`; status → `dsa-signed`.

**Track-aware execution (per STEP 2 decision tree):**
- `public-track` — 3–5 business days expected; Partner counsel review typically light (no PII surface); two-person Ministry approval **not required**.
- `sensitive-track` — 3–7 business days expected (NIN-verify scope; no PII payload); two-person Ministry approval **not required**.
- `pii-track` — 5–15 business days expected; two-person Ministry approval **required** per FR24 / Decision 3.4.

**Escalation path** (calibrated to the per-track budget; Super Admin tracks `dsa_drafted_at` + days-elapsed):
1. **Day +N** where N = upper bound of the per-track STEP 4 budget (5 for public, 7 for sensitive, 15 for pii): Super Admin sends a courtesy status-check email to Partner technical contact.
2. **Day +N+5 business days, no response:** escalate internally to Ministry ICT Lead (CC Iris for pii-track).
3. **Day +30 (any track):** escalate to Permanent Secretary, with brief from Iris; consider whether Partner has materially changed circumstances.
4. **Day +60 from STEP 3 (any track):** status → `stalled`; do not auto-revert; await direction. Tracker `notes` records the stall reason.

**Output:** Signed DSA in S3; tracker row in `dsa-signed`.
**Time budget:** 5–15 business days; escalation triggers above.

---

## STEP 5 — API Key Provisioning (1 business day)

> **Prerequisites (mandatory).** STEP 5 cannot execute against a real Partner until ALL of the following are deployed to production:
>
> | Story | What it provides | Why STEP 5 needs it |
> |---|---|---|
> | **10-1 — Consumer Auth Layer** | `api_consumers` schema, `api_keys` schema, `X-API-Key` + signing header validation, scope + LGA-scope enforcement | Without 10-1, there is no auth layer to validate the issued key against. |
> | **10-2 — Rate Limiting** | Per-Consumer per-minute / per-day / per-month enforcement of the limits set at Schedule 1 §2 | Without 10-2, the Schedule 1 §2 limits are unenforced — Partner could overload OSLRS. |
> | **10-3 — Consumer Admin UI** | CRUD on `api_consumers` + `api_keys`, token display-once UI, audit-of-issuance | Without 10-3, there is no operator surface to issue a key. |
>
> If any of the above is not yet shipped, **do not execute STEP 5 against a real Partner** — escalate to Product Owner. (For dry-run / paper-walk validation purposes Story 10-5 has already exercised STEP 5 mechanically; that exercise does not constitute a real provisioning.)

**Action:**
1. Super Admin uses Story 10-3 Consumer Admin UI to:
   - Create `api_consumers` row with `dsa_url` referencing the signed DSA PDF in S3.
   - Issue the first `api_keys` row with rotation cadence per Schedule 1 §1 (default 180 days; PII-track 90 days).
   - Configure scopes per Schedule 1 §2 with LGA Scope, IP allowlist, and per-minute / per-day / per-month limits.
2. Token displayed exactly once in the Consumer Admin UI; Super Admin copies to clipboard.
3. Token delivered to Partner per the channel specified in DSA Schedule 3 §1 (PGP-encrypted email OR in-person handoff).
4. Audit log entry created automatically by the Consumer Admin UI on issuance: `action='api_key.issued'` + `consumer_id=<id>`.
5. **Token-delivery audit entry written manually by Super Admin** in the Consumer Admin UI: `action='api_key.delivered'`, `meta={ channel: 'pgp_email' | 'in_person', recipient_name, recipient_email_or_id, delivered_at }`.
6. Tracker status → `provisioned`; tracker `api_key_id`, `provisioned_at` populated.

**Output:** Partner has key in hand; provisioning audit entries in `audit_logs`.
**Time budget:** 1 business day from DSA signature.

---

## STEP 6 — Partner Integration (variable; Partner-paced)

**Action (Partner side):** Partner integrates against documentation at `/developers` (Story 10-4) and OpenAPI/Swagger UI generated from Zod schemas.

**Action (Ministry side):**
1. Partner is encouraged to verify with `aggregated_stats:read` scope first (no PII risk).
2. On first successful production request, Super Admin marks tracker status → `active`.
3. Quarterly health-check meetings scheduled — see STEP 7.

**Output:** Partner traffic flowing in production; tracker `active`.

---

## STEP 7 — Quarterly Review + Annual Renewal

### Quarterly Review (every 3 months from DSA Effective Date)

**Calendar reminders.** The tracker `next_quarterly_review` field is **canonical** — it is the source of truth for when the next review is due, the field that automation may eventually pull from, and the field updated at the close of every review (Super Admin sets it to `today + 3 months`). The Ministry's shared-calendar entry is a **secondary, defence-in-depth reminder** — convenient for the operator but not authoritative. If the two disagree, the tracker wins.

**Action:**
1. Super Admin opens Story 10-6 Consumer Audit Dashboard, filters to this consumer. **If Story 10-6 has not yet shipped**, fall back to the manual psql query below.
2. Review:
   - Anomalies in request rate (sudden spikes / drops / time-of-day patterns)
   - Scope-rejection rate (anything > 1% indicates Partner code is buggy or out of compliance)
   - LGA-scope violations (zero tolerance — anything > 0 triggers immediate investigation)
   - Top-N most-requested target IDs (any individual targeted disproportionately?)
3. Partner submits Quarterly Compliance Attestation (DSA Schedule 3 §4) to `support@oyoskills.com`.
4. Anomalies discussed in 30-min health check call; outcomes logged in tracker `notes`. Super Admin updates tracker `next_quarterly_review` to `today + 3 months` before closing the row's review for this quarter.

**Manual fallback (until Story 10-6 ships).** Super Admin runs the following against the production database via `docker exec -i oslsr-postgres psql -U oslsr_user -d oslsr_db`:

```sql
-- Quarterly summary by status + scope for one consumer over the past 90 days
SELECT
  date_trunc('week', created_at) AS week,
  status,
  meta->>'scope' AS scope,
  COUNT(*) AS n
FROM audit_logs
WHERE actor_consumer_id = '<CONSUMER_UUID>'
  AND created_at >= now() - interval '90 days'
GROUP BY 1, 2, 3
ORDER BY 1 DESC, 4 DESC;

-- Any LGA-scope violations in the past 90 days (zero-tolerance)
SELECT created_at, meta
FROM audit_logs
WHERE actor_consumer_id = '<CONSUMER_UUID>'
  AND status = 'AUTH_LGA_OUT_OF_SCOPE'
  AND created_at >= now() - interval '90 days'
ORDER BY created_at DESC
LIMIT 50;

-- Top-N most-requested target IDs (PII-track only — surface targeting)
SELECT meta->>'target_id' AS target_id, COUNT(*) AS n
FROM audit_logs
WHERE actor_consumer_id = '<CONSUMER_UUID>'
  AND meta->>'scope' = 'submissions:read_pii'
  AND created_at >= now() - interval '90 days'
GROUP BY 1
ORDER BY 2 DESC
LIMIT 20;
```

Findings flagged manually to the same triage criteria above; outcomes logged in tracker `notes`. When Story 10-6 ships, this manual fallback is retired.

### STEP 7.5 — Mid-Term PII Re-affirmation (PII-track only, every 6 months)

**Trigger:** the 6-month mark from DSA Effective Date for any Consumer holding `submissions:read_pii` scope. Calendared by Super Admin at provisioning; tracker `notes` records the date. (Future enhancement: a `next_pii_reaffirmation` column on the tracker.)

**Action:**
1. Super Admin alerts Iris (or successor in role) **30 days before the 6-month mark**.
2. Iris reviews the Appendix H §H.<N> DPIA section against current circumstances:
   - Has the Partner's Purpose changed?
   - Have the LGA scopes changed?
   - Has any breach been recorded against this Consumer in the prior 6 months (audit_logs `action='dsa.breach_recorded'`)?
   - Are NDPA / regulatory obligations unchanged?
3. **Outcome A — re-affirmed:** Iris writes an audit entry `action='dpia.reaffirmed'` referencing the Consumer + section number; the `submissions:read_pii` scope auto-renews for another 6 months per DSA Schedule 1 §2 footnote. Status remains `active`.
4. **Outcome B — amended:** Iris drafts an updated Appendix H §H.<N> section. Material amendment is communicated to the Partner with at least 14 days' notice before the renewed term commences (per DSA Schedule 3 §5). The scope auto-renews on the new terms.
5. **Outcome C — declined re-affirmation:** the `submissions:read_pii` scope lapses on the 6-month mark per DSA Schedule 1 §2 footnote condition (a). Partner is notified by email; remaining non-PII scopes continue. Partner may re-onboard the PII scope via a fresh STEP 1 if circumstances change.

### Annual Renewal (every 12 months)

**Calendar reminder:** 90 days before initial term expiry.

**Action:**
1. **Day −90:** Ministry sends renewal questionnaire (DSA Schedule 3 §5).
2. **Day −60:** both parties review prior 12 months' audit log together; Iris re-affirms or amends Appendix H DPIA section; Gabe reviews any DSA amendments.
3. **Day −30:** sign renewal addendum (or notify of termination).
4. **Day 0:** if renewed, tracker `next_renewal` advanced 12 months. If not renewed, transition to termination per §STEP 8.
5. **Day +7 (no renewal, no termination notice):** automated key revocation per NFR10 expiry logic — surfaces in Story 10-6 dashboard as critical alert. Super Admin contacts Partner urgently.

---

## STEP 8 — Termination Procedure

**Initiation:** either Party gives 90-day written notice (Article 9.2 of DSA) OR Ministry terminates immediately for material breach (Article 9.3) OR Annual Renewal lapses without action.

**Day −90 (notice given):**
1. Super Admin records termination notice in tracker; status → `termination-notice`.
2. Both Parties acknowledge in writing.

**Day 0 (termination effective date):**
1. Super Admin disables Partner's API Keys via Story 10-3 Consumer Admin UI (revoke, not delete — preserves audit trail).
2. Audit log entry: `action='api_key.revoked'`, `meta={ reason: 'dsa_terminated', termination_effective_date }`.
3. Tracker status → `terminated`.

**Day +30 (data deletion attestation due):**
1. Partner provides written attestation per DSA Schedule 3 §6 confirming deletion or return of all OSLRS Data.
2. Attestation filed in S3 alongside signed DSA.
3. Tracker `data_deletion_attested_at` timestamp populated.
4. If Partner fails to attest by Day +35, escalate to Ministry ICT Lead → Permanent Secretary → Gabe (consider legal action).

**Long-term:**
- DSA itself stays on file 7 years per Article 9.6 (NFR4.2).
- Audit logs of Partner's API activity stay 7 years per audit retention policy.
- Tracker row stays in repo (not deleted) — historical record.

---

## Token Delivery Channel — Acceptance Criteria

Per DSA Schedule 3 §1, ONE of the following two channels must be used to deliver the first API Key (and any rotated key):

### Channel A — PGP-Encrypted Email (preferred)

**Pre-conditions:**
- Partner Authorised Personnel has a PGP keypair.
- Partner provides the public key + fingerprint to Super Admin during STEP 3.
- Super Admin verifies fingerprint via a second channel (phone call or in-person; *never* by email — defeats the purpose).

**Operation:**
1. Super Admin copies token to a plaintext file, encrypts with Partner's public key (`gpg --encrypt --armor --recipient <FINGERPRINT> token.txt`).
2. Sends the `.asc` ciphertext to Partner via email.
3. Partner decrypts; verifies token works against `aggregated_stats:read` test endpoint.
4. Super Admin destroys plaintext token file.
5. Audit entry: `meta.channel='pgp_email'`.

### Channel B — In-Person Handoff at Ministry HQ

**Pre-conditions:**
- Partner Authorised Personnel travels to Ministry HQ.
- Recipient name + government-issued photo ID confirmed in advance.

**Operation:**
1. Super Admin prints token on paper (no metadata; just the bearer secret).
2. Super Admin verifies recipient identity against photo ID; records ID number.
3. Recipient takes paper, immediately verifies token works on a Ministry-provided test terminal.
4. Paper destroyed in Ministry shredder in recipient's presence.
5. Recipient signs handoff register.
6. Audit entry: `meta.channel='in_person'`, `recipient_id_number`, `handoff_register_page`.

### NOT Acceptable

- Plain email (token readable by mail server admins / Mailbox.org-class providers / mail-handling Sub-Processors at Partner)
- SMS (SS7 vulnerability, unencrypted)
- WhatsApp / Telegram / Signal (third-party storage; key resides on third-party servers regardless of E2E claims)
- Slack / Teams / corporate chat (third-party storage; admin-readable)
- Cloud storage (Drive / Dropbox / Box) (link surface + indexing risk)
- Voice call (recoverable by call recording; difficult to confirm receipt)

---

## Linked References

- DSA Template — `docs/legal/data-sharing-agreement-template-v1.md`
- DSA Sign-off — `docs/legal/dsa-template-v1-signoff.md`
- Tracker — `docs/legal/consumer-onboarding-tracker.md`
- Architecture ADR-019 — `_bmad-output/planning-artifacts/architecture.md:3179`
- Architecture Decision 3.4 — `_bmad-output/planning-artifacts/architecture.md` Decision 3.4
- Story 10-1 (Consumer Auth) — `_bmad-output/implementation-artifacts/10-1-consumer-auth-layer.md`
- Story 10-3 (Consumer Admin UI) — `_bmad-output/implementation-artifacts/10-3-consumer-admin-ui.md`
- Story 10-4 (Developer Portal) — `_bmad-output/implementation-artifacts/10-4-developer-portal.md`
- Story 10-6 (Consumer Audit Dashboard) — `_bmad-output/implementation-artifacts/10-6-consumer-audit-dashboard.md`
- Baseline Report Appendix H — `_bmad-output/baseline-report/BASELINE-STUDY-REPORT-COMPLETE.md`
- NDPA full text — Federal Government of Nigeria official gazette

---

*— END OF SOP v1 —*
