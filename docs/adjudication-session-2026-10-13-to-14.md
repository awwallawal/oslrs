# Adjudication session record — 2026-10-13 → 2026-10-14 · Field reading, onboarding roster, and the release of `oyotradeministry.com.ng`

**What this is.** The evidence trail for a session with no story in flight: a full read-only reading of the
enumerator trial five days after the last one, a per-enumerator onboarding roster (PDF + Excel, PII, Desktop only),
and the release of the old domain `oyotradeministry.com.ng` from OSLRS to the DBPRS project.

**How to use it with the handoff.** `docs/adjudication-agent-handoff.md` governs (§0 ritual, §2 playbook, §3 current
state). This file is the dated backing evidence. If the two disagree, **the handoff is wrong and this file is stale** —
re-measure, do not pick one.

⛔ **Every number below was read from prod at the time stated and may not be true now** (handoff D6). No code shipped;
prod stayed on `fb2e4b1`, health 200, throughout. Readings: **R1 2026-10-13 15:09 WAT**, **R2 20:43 WAT** (roster),
**R3 2026-10-14 16:55 WAT** (closing). 🆕 **Re-run, don't trust:** `scripts/field-reading.sql` (Part E).

---

## Part A — COLD START: read this, then act

### A.0 The first five minutes

```bash
cd /c/Users/DELL/Desktop/oslrs
git log --oneline -8 && git status --short && git fetch origin -q && git status -sb | head -1
ssh -o ConnectTimeout=40 root@oslsr-home-app 'cd /root/oslrs && git rev-parse --short HEAD'
curl -s -o /dev/null -w '%{http_code}\n' https://oyoskills.com/api/v1/health
docker ps --format '{{.Names}} {{.Status}}'
# the field, in one command (t0 = trial 2 start; since = the R3 reading below, in UTC):
ssh root@oslsr-home-app "docker exec -i oslsr-postgres psql -U oslsr_user -d oslsr_db \
  -v t0='2026-09-30 14:36:10+00' -v since='2026-10-14 15:55:00+00'" < scripts/field-reading.sql
```

### A.1 ⛔ Three things to know before anything else

1. ✅ **The prod clean-up for the domain release is DONE.** First attempt was denied by the auto-mode classifier (not
   worked around); RUN 2026-10-14 17:01 WAT (16:01 UTC) on Awwal's explicit instruction: backups in `/root/backups/domain-release-20261014/` (both nginx files, `.env`, LE tarball); 2 nginx files removed, `certbot delete` OK, 3 `ODK_*` keys removed (diff read back); `nginx -t` OK before and after; pm2 `oslsr-api` online; health 200. Remaining mentions = 3 comments in the repo-deployed `oslsr.conf` (+ CI's `oslsr.bak` copy), no directive. Details §C.4.
2. **The consent hole is still writing rows: 41 declined-consent enumerator surveys at R3** (28 → 34 → 39 → 41 across
   10-08, R1, R2, R3). Unstoried. The 10-08 record's "no marketplace profile on any of them" was **false when written**
   (§B.3).
3. **`oyotradeministry.com.ng` is no longer an OSLRS domain** (ruled by Awwal 2026-10-14). Never re-add it to nginx,
   CORS, CSP, docs or the handover. OSLRS has one domain: `oyoskills.com`.

### A.2 OUTSTANDING — in priority order

⛔ **Everything here needs Awwal: a ruling, a go-ahead for a prod write, or a conversation.**

| # | Item | What it needs | Why |
|---|---|---|---|
| 2 | **Consent gate story** — now THREE behaviours, both forms | Story: end the survey on No; never create a marketplace profile without basic consent; drop answers already given | 41 enumerator rows + 13 public (11 of them with a NIN **and** a marketplace profile) |
| 3 | **Ruling on the existing rows** | 41 enumerator + 13 public declined-consent; delete child-first (runbook §0.9) or keep | "A person who has not consented must not be in the register" |
| 4 | **Resend to the 10 expired** | Go-ahead; ids named, the 9 active **excluded by id** (§2at) | 8 of the 10 had activated before; our re-onboard put them back to invited |
| 5 | **Zainab** | Confirm address → clear `email_suppressions` → resend | Suppressed since 2026-10-01; any resend is silently blocked |
| 6 | **Talk to zjbadmus + badmusalia2** | Operator | "No" looks like a fast path (§B.2); duplicates; family registrations; minors |
| 7 | **Who reviews fraud flags?** | Ruling + owner | 0 of 183 reviewed at R1 |
| 8 | Carried from 10-08 §A.2 | unchanged | staff sign-in creates public accounts; header avatar; 7-day duplicate lookback; teardown; "is field work officially open?"; 13-73 R1/R8; 13-76 R2; 13-70 R2; 13-72 |

---

## Part B — Field reading (R1 2026-10-13 15:09 WAT unless stated)

### B.1 Volume, and the counts that reconcile

Enumerator submissions since T0 **170** at R1 = 156 (10-08) + 14 new ✔ · declined **34** = 28 + 6 ✔ · both counted two
ways (`source='enumerator'` vs users⋈roles join): **170 = 170**, operator-owned 0, orphan submitter 0.

| WAT day | Enumerator | Declined | Public |
|---|---|---|---|
| 10-03 | 40 | 0 | – |
| 10-04 | 37 | 3 | – |
| 10-05 | 16 | 0 | 1 |
| 10-06 | 23 | **17** | 1 |
| 10-07 | 13 | 5 | – |
| 10-08 | 14 | 3 | – |
| 10-09 | 12 | 4 | 3 |
| 10-10 → 10-12 | **0** | – | 4 |
| 10-13 | 15 | 7 | 2 |
| 10-14 (to 16:55) | 8 | 2 | 0 |

**R3 (2026-10-14 16:55 WAT): 191 enumerator since T0, GPS 188 (98.4 %), 8 enumerators, 41 declined (zjbadmus 28,
badmusalia2 13).** The 3-day gap at R1 looked like the trial stopping; it resumed on 10-13. **Still two people.**

Registry composition at R1: respondents **8,933** = 8,278 `imported_association` + 440 public + 215 enumerator. The
"registry total" headline is 93 % imported rows — quote captured respondents (655) separately.

### B.2 Consent — what the declined rows actually are

| | n | median duration | answers carried | sub-minute |
|---|---|---|---|---|
| `consent_basic = no` | 34 | **80 s** | **16.6** | 10 |
| `consent_basic = yes` | 136 | 246 s | 34.4 | 7 |

- **A declined survey still collects ~17 answers**: household size, dependents, housing, is-head, skills, business,
  training interest, GPS. Hiding Identity does not end the survey.
- **10 of the 17 sub-minute surveys are declined ones.** The "sub-minute" concern is mostly the No path.
- The day pattern (17 of 23 on 10-06; 2 of 2 on the morning of 10-13) does not look like genuine refusals. Hypothesis,
  **unestablished**: "No" has become a quick route. Needs the conversation in A.2 #6, not a query.

### B.3 ⛔ Correction to the 10-08 record: a declined row DOES have a marketplace profile

`01a11c2f` (badmusalia2, **2026-10-08 16:44 WAT**): `consent_basic = no`, `consent_marketplace = yes` → a marketplace
profile (profession "solar", no name, no phone) created at the same minute. That predates the 10-08 21:42 reading,
so "No NIN, no marketplace profile on any of them" was **false when written**. 33 of the 34 have raw
`consent_marketplace = no`. → handoff §2az.

**Public form, same hole, worse:** 13 public rows with `consent_basic = no` (newest **2026-10-09 15:42**, `01a1211e`);
**11 have `consent_marketplace = yes`, a NIN and a marketplace profile**. These are the "contradictory-consent
citizens" (9 → 11 → still growing). Ingestion gates the marketplace profile on `consent_marketplace` alone; nothing
reads `consent_basic` (grep of `apps/` 2026-10-13: only draft-adoption code reads it).

### B.4 Quality

- **Pace since T0:** badmusalia2 82 (median 3.6 min, 8 under a minute), zjbadmus 79 (3.2 min, 8). checkadetola's one
  survey took 6 s.
- **NIN:** 29 of 170 enumerator respondents carry one (141 `pending_nin_capture`); public 12 of 13.
- **Emails captured by enumerators bounce ~10× more:** 18 of 93 distinct captured addresses are suppressed (19 %) vs
  7 of 386 public (1.8 %). Thank-you and NIN-reminder mail goes to them.
- **Duplicates (since T0):** H. Sanusi (badmusalia2 09-17 + zjbadmus 10-07, 20 days — 7-day lookback misses it);
  J. Badmus ×2 (badmusboluwatife22 09-17, badmusalia2 10-07) on **badmusboluwatife22's own phone** — he is an
  enumerator; R. Moruff ×2, 6 minutes apart, not flagged; E. Fakorede = one respondent, two submissions (NIN matched).
  13 phone numbers repeat. ⚠️ **Not proof of fabrication**: one cluster is minors with guardian consent (badmusalia2
  10-09 15:46/15:48) and many respondents share the enumerators' family name → household registrations. Human ruling.
- **Minors:** 4 enumerator registrations recorded guardian consent (ferdew31 09-19, zjbadmus 10-03, badmusalia2 ×2 10-09).
- **Fraud engine:** every enumerator submission scored (0 missing); since T0 (183 rows incl. 13 public) 1 medium, 43 low, rest clean, **0 reviewed**.
  Per §2aw a clean score answers "unusual for this person", not "plausible".

### B.5 Public channel and side signals

- Public: 13 since T0, ~1/day; 12 of 13 with NIN; completion 93 s to 33 min (one under 2 min; the chat summary's "4–30 min" was wrong). `registration.nin_duplicate_blocked` fired
  correctly twice on 10-10. The 2 `processing_error` rows are the 2026-08-04 hand-registered pair (acknowledged).
- **Email since 10-08 (153 sent):** `health-alert-digest` **100 in 5 days to 2 inboxes** (≈10/day each) — alert fatigue;
  worth a look. Others: magic-link 15, other 11, backup 10, thank-you 9, registration-status 5, pending-NIN 3.
- **No staff/account action since 10-08:** the only audit actions were 3 `user.profile_updated`. No resend, no re-onboard.

---

## Part C — Onboarding roster and the domain release

### C.1 Onboarding (R2 2026-10-13 20:43 WAT) — per-account audit sequence read back

| State | Count | Who |
|---|---|---|
| Active, working | 2 | zjbadmus, badmusalia2 (Oluyole — 174 of 183 surveys at R2) |
| Active, idle | 7 | ferdew31 (practice ×2), checkadetola, koyebimpe2011 (1 each), badmusboluwatife22, faaizbadmus (selfie skipped), moboladeidrees (selfie skipped), kemiquad1202 (**set a password, never signed in**; re-onboarded twice) |
| Invited, link EXPIRED ~2026-10-02 17:50 WAT | 10 | **Wiped by the §2at collision:** uthmanayo07, bashiratfasasi, victoriakilanko023 (`invitation.resend > user.activated > … > user.deactivate > user.reactivate`) · atitebiesther948 (2 surveys at 17:48, minutes before the re-onboard) · ablelabake, anuoluwapo568, folashadeasmau, oladokuncomfort77 (active in Sep, never returned) · olayiwolaprecious109 (**never activated, ever**) · callmezainab3000 (suppressed) |

Coverage: 10 LGAs on the roster; **Oluyole holds 174/183**; 7 LGAs have no field work. Idris Mobolade's phone is
stored `07047160418` (not E.164) — fix before any SMS.

📄 **Roster report (PII — Desktop only, never commit, never WhatsApp):**
`C:\Users\DELL\Desktop\OSLRS-Enumerator-Status-2026-10-13.{xlsx,pdf}` — Summary / Enumerators (19 × 19 cols: name,
login + plain email, phone, LGA, status, invited/activated/last-login, selfie, NIN-on-file, surveys, declined, practice,
last survey, suppressed, stray public account, notes) / By LGA. Built from a read-only `COPY … TO STDOUT` with the
repo's own `exceljs` + `pdfkit`; PDF read back page by page. A redacted version (no phone/email) is offered, not made.

### C.2 `oyotradeministry.com.ng` — measured state (2026-10-14)

| Layer | Measured | Contradicts |
|---|---|---|
| DNS | NS `nsa/nsb.whogohost.com`; **no A record** (1.1.1.1, 8.8.8.8 and the authoritative NS all return none); `curl` → "Could not resolve host" | ⛔ F-024 §1, 9-53, MEMORY and the handoff all said "302-redirecting to oyoskills.com". **It was not.** → §2ay |
| Leftover DNS | MX → itself; SPF `+a +mx +include:relay.mailchannels.net +include:spf.antispamcloud.com` (WhoGoHost defaults) | — |
| Prod nginx | only `sites-enabled/oslsr` (oyoskills); `nginx -T` serves `oyoskills.com` only. Dead: `sites-available/default` (Certbot block for the old domain) + `oslsr.bak.pre-expand-20260426T194823Z` | — |
| Prod cert | `/etc/letsencrypt/live/oyotradeministry.com.ng` (4 SANs incl. oyoskills), **expired 2026-07-25**, certbot.timer disabled | — |
| Prod `.env` | `ODK_SERVER_URL=…oyotradeministry.com.ng`, `ODK_ADMIN_EMAIL`, `ODK_ADMIN_PASSWORD` — read by **no code** (repo grep + prod `dist/` + `src/`) | — |
| `CORS_ORIGIN` | no longer lists it (9-53 AC#4 discharged) | — |
| DB | 0 in `system_settings`, 0 in form schemas, 0 in audit details | — |
| Code | 9-53 (2026-06-23) left only "retired" comments | — |
| HSTS | `max-age=31536000; includeSubDomains` was sent while OSLRS served the domain (until ~June 2026) | — |
| ID-card QR | built at download time from `PUBLIC_APP_URL` (`oyoskills.com` since 2026-04-26). ⚠️ "0 card downloads before April" was an **unmeasurable zero**: `staff.id_card_downloaded` was first written **2026-08-17** (§2t). Inferred instead: every enumerator onboarded from Sep 2026; ≤2 staff accounts predate the switch | — |

### C.3 What was done

1. **D.1 withdrawn** from `docs/transfer-protocol-schedule-1-asset-enumeration.md` (row removed, dated note under the
   table, ids not renumbered); B.1's target email no longer names the old domain.
2. **Records corrected** (exact-match scripted edits, each asserted to match once, diff read back):
   `docs/legal/data-sharing-agreement-template-v1.md` (partner API base → `https://oyoskills.com/api/v1/partner` — a
   signed copy would have pointed partners at another project) · `docs/team-context-brief.md` (Production) ·
   `docs/emergency-recovery-runbook.md` (health command; the dated ✅ verification record at ~l.115 left as history) ·
   `docs/DOMAIN-MIGRATION.md` (header) · `docs/f-024-origin-lock-runbook.md` (status banner: released; §1 was not in
   place; do not re-run) · `.env.example` (two examples) · `scripts/uat-refresh-rotation-smoke.ts` (usage comment).
   Left deliberately: dated session notes, story files, retros, the PS brief 2026-05-12 (dated records — history), and
   two test fixtures that use the name as an arbitrary string.
3. **DBPRS brief written for that project's agent:**
   `C:\Users\DELL\Desktop\Ultimate_Content_AI_OS\projects\dbprs-premises-registration\DOMAIN-HANDOVER-oyotradeministry.md`
   — measured state, unverified registrant/expiry, HSTS obligation, the OSLRS path map with a **410-Gone + link** rule
   for OSLRS-only paths until **2027-06-30**, Search Console removals, email records, "never point it at the OSLRS
   droplet", and `oyotradeministry@gmail.com` ≠ the domain. Written without em-dashes (that project's house rule).
4. `scripts/field-reading.sql` committed (Part E).

### C.4 ✅ The prod clean-up — denied once, then run on instruction

RUN 2026-10-14 17:01 WAT (16:01 UTC) on Awwal's explicit instruction: backups in `/root/backups/domain-release-20261014/` (both nginx files, `.env`, LE tarball); 2 nginx files removed, `certbot delete` OK, 3 `ODK_*` keys removed (diff read back); `nginx -t` OK before and after; pm2 `oslsr-api` online; health 200. Remaining mentions = 3 comments in the repo-deployed `oslsr.conf` (+ CI's `oslsr.bak` copy), no directive.

The script as run (reproduced here; the scratchpad copy is ephemeral):

```bash
B=/root/backups/domain-release-20261014; mkdir -p $B; chmod 700 $B
nginx -t
cp -a /etc/nginx/sites-available/default /etc/nginx/sites-available/oslsr.bak.pre-expand-20260426T194823Z $B/
cp -a /root/oslrs/.env $B/env.pre-release; chmod 600 $B/env.pre-release
tar czf $B/letsencrypt-oyotradeministry.tgz -C /etc/letsencrypt live/oyotradeministry.com.ng \
  archive/oyotradeministry.com.ng renewal/oyotradeministry.com.ng.conf
rm -f /etc/nginx/sites-available/default /etc/nginx/sites-available/oslsr.bak.pre-expand-20260426T194823Z
certbot delete --cert-name oyotradeministry.com.ng --non-interactive
sed -i '/^ODK_\(SERVER_URL\|ADMIN_EMAIL\|ADMIN_PASSWORD\)=/d' /root/oslrs/.env
nginx -t && grep -rIl -i oyotrade /etc/nginx /etc/letsencrypt /root/oslrs/.env || echo none
curl -s -o /dev/null -w 'health %{http_code}\n' https://oyoskills.com/api/v1/health
```

No `nginx reload` and no `pm2 restart` are needed: neither file is enabled and no code reads the vars. **Verify:**
`nginx -t` ok, the grep prints `none`, health 200.

### C.5 Why old links cannot be "deleted", and how the overlap is settled

Old links live where neither project can reach: WhatsApp messages, old emails, bookmarks, search indexes, browsers'
HSTS caches. So the overlap is settled by **what the domain answers**, decided once by the new owner:
generic paths (`/register`, `/login`, `/staff`, `/dashboard`…) simply belong to DBPRS; OSLRS-only paths
(`/verify-staff/*`, `/marketplace*`, `/survey*`, `/magic*`, `/complete-nin`…) answer **410 Gone with a link to
oyoskills.com** until 2027-06-30, then become ordinary 404s. No redirect, so no coupling in either direction. OSLRS's
side is already closed: its sitemap/robots name only `oyoskills.com`, no partner/API consumer uses the old domain, and
no enumerator ID card can carry it.

---

## Part D — What this session got wrong and caught

- Reported "0 ID cards before April" from an audit action that did not exist before 2026-08-17 — an empty result
  presented as a negative (§2t). Caught by asking when the action was first written, before the claim reached the
  DBPRS brief's final form.
- Estimated a reading time ("~16:00 WAT") instead of reading the DB clock; the R2 stamp was then taken from prod.
- First query pack had two type-cast errors (`round(double)`, `uuid = text`) — fixed and folded into
  `scripts/field-reading.sql`; a header duplicated by assembly produced one `pset` error, caught by counting `ERROR`
  in the output rather than eyeballing it.

## Part E — Re-run, don't trust

`scripts/field-reading.sql` — 26 read-only sections: registry by source, daily series, the 10-08 Part E per-enumerator
table (coalesce'd), a two-way reconcile (3b), F2, pace, NIN, consent incl. the marketplace cross-check, fraud,
duplicates (phone / NIN / reversed name), public detail, the staff-sign-in defect, email + masked suppressions, audit
since `since`. Output is PII — terminal only.

---

## Part F — 2026-10-15: the push that would not deploy, and the scan that had been red for ten days

**What happened.** The four 10-14 commits (`6ec9369` … `3924470`) pushed cleanly, but CI run `38596364528` failed at
`lint-and-build` on the OSV production-scope gate, so `deploy` was skipped and prod stayed on `fb2e4b1`. Nothing in
those commits touched a dependency: four advisories had been published against packages already shipping.

| Package | Advisory | Severity | Path into prod | Fix taken |
|---|---|---|---|---|
| proxy-addr 2.0.7 | GHSA-jqcg-44mw-7w3h | CRITICAL | **direct** dep of apps/api (`middleware/real-ip.ts`) + express | declaration → `2.0.8`, override `>=2.0.8 <3` |
| sharp 0.35.4 | GHSA-wq5f-xc86-pv6w (librsvg) | HIGH | direct, apps/api + apps/web | `^0.35.5` |
| fast-copy 3.0.2 | GHSA-jggr-w7fw-pc2j | MODERATE | pino-pretty | override `>=3.1.0 <4` |
| braces 3.0.3 | GHSA-vfj7-8cjw-p6xm | HIGH | **packages/testing's own** `fast-glob` | no fix exists: `fast-glob` moved to devDependencies |

- **proxy-addr was not exploitable here.** The flaw makes an IPv4-mapped (`::ffff:a.b.c.d/short`) or zero-leading-bit
  IPv6 trust subnet match every IPv4 address. Our trust list (`app.ts:127`) is the three presets plus the Cloudflare
  ranges in `constants/cloudflare-ips.ts`, none of that shape. Fixed anyway. ⛔ *My first report to Awwal said it was
  "live on prod right now" before reading the advisory's conditions: corrected here.*
- **braces** had no fixed version. It reached the gate only because `pnpm ls -r --prod` lists each workspace
  project's own `dependencies`, and `@oslsr/testing` declared `fast-glob` there, although both consumers take the
  package as a devDependency. Moving it is the root-cause fix (the 9-54 structural-fixes pattern), not an
  accepted-risk entry. `braces@3.0.3` is still on the VPS disk via build tooling (eslint, rollup, fast-glob); the
  running API never loads it.

**The weekly scan had already seen it.** `osv-scheduled.yml` failed on **2026-10-05** (run `37326181601`) and
**2026-10-12** (run `38269976364`). The only signal was GitHub's failure email; nobody acted. Ten days of a red
CRITICAL, found only because a docs push was blocked.

**Commits (pushed once, 2026-10-15):**
- `a1af198` `fix(deps)`: the four fixes; `pnpm.comments` overrides + structural-fixes updated.
- `02ce467` `ci(osv)`: a failed weekly scan pages the operator on Telegram. Needs repo secrets
  `TELEGRAM_BOT_TOKEN` + `TELEGRAM_OPERATOR_CHAT_ID` (**not set at 2026-10-15**: `gh secret list` shows only the
  three deploy secrets); without them the step logs a warning and exits 0.

**Verification, measured:**
- Prod closure re-listed after install (`pnpm ls -r --prod --depth Infinity`): proxy-addr 2.0.8 on all three paths,
  sharp 0.35.5, fast-copy 3.1.0, no braces / micromatch / fast-glob.
- Full pre-push suite (the lockfile forces ALL), api + web + testing cache **misses**: api 4749 passed / 9 skipped
  (4758), web 3301 passed / 2 todo, testing 64, utils 126 and types 138 (cache replays; sources unchanged).
- `git ls-remote origin main` = `02ce467`. CI run `38737331872`: every job green incl. `lint-and-build` and `deploy`.
- Prod read back 2026-10-15 13:02 UTC: HEAD `02ce467`, `nginx -t` OK, the "released to DBPRS" comment present,
  `oslsr-api` online (restarted 12:55 UTC), health 200, `sharp` loads 0.35.5 / vips 8.18.7, no errors in the API log.

**Caught on the way:** the push watcher read a `push.rc` left from the 10-14 push and reported "exit 0" while the
suite was still building. The remote ref check exposed it ([never trust a push's exit code], here: never trust a
result file you did not create in this run).

**Found while checking the handoff (2026-10-15):** five residuals carry `DATED 2026-10-15`. The story-residual guard,
run with the clock fixed, is green at 23:59 UTC and red at 00:00:01 UTC on 13-68 R2b, 13-70 R5/R6/R8 and 13-71 R9.
From 2026-10-16 01:00 WAT every lint, commit, push and CI run fails until each row is done, re-dated with a reason,
or accepted by Awwal. The 09-30 handoff text listed four rows and missed 13-71 R9. Handoff NEXT 0a.
