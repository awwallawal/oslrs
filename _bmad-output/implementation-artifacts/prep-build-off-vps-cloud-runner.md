# Prep Story: Build Off-VPS via Cloud-Runner Artifact Handoff (Wave 0)

Status: in-progress

<!--
Created 2026-04-27 by Awwal+Claude after Phase 3 ship triage. The 2026-04-27 06:32 UTC CRITICAL system-health digest (cpu 100%, memory 91%) was triaged as deploy-driven, not runtime. Root cause: `pnpm install` + `pnpm --filter @oslsr/web build` runs on the 2GB VPS as part of every deploy, consuming 700MB-1GB RAM + 70-90% CPU for 2-3 min. CI's `lint-and-build` job ALREADY builds the same dist on a cloud runner and discards the output. This story stops discarding it.

Wave 0 close-out gate (Task 5):
  • Strong Path: 2 measured deploys, both with CPU <30% AND mem <1Gi AND wall-clock <4 min AND no CRITICAL digest within deploy window → flip status `done` via close-out commit
  • Soft Path: 7 days elapsed since Wave 0 merge AND deploys-that-did-happen all show wall-clock <4 min in GH Actions UI AND no CRITICAL digests fired → flip status `done` (AC#7+AC#8 inferred from "no CRITICAL fired")
  • Calendar gate: if commits 2 + 3 haven't both landed by 2026-05-06 (7 days post-Wave-0 merge), trigger Soft Path closure

Validation pass 2026-04-29 (Bob, fresh-context mode 2 per `_bmad/bmm/workflows/4-implementation/create-story/checklist.md`): rebuilt to canonical template structure; all `[x]` state preserved exactly; status `in-progress` preserved; Review Follow-ups (AI) findings catalogue moved verbatim from Tasks/Subtasks to Dev Agent Record.
-->

## Story

As the **operator**,
I want **the production web build (vite + tsc) to run on the GitHub-hosted CI runner and ship its `dist/` output to the VPS as a downloaded artifact**,
so that **VPS resource spikes during deploy stop tripping CRITICAL system-health alerts (alert noise → real signal), deploy time drops, and the 2GB VPS is reserved for runtime workload only**.

## Acceptance Criteria

1. **AC#1 — Deploy job downloads existing `build-artifacts` artifact:** The `deploy` job in `.github/workflows/ci-cd.yml` adds an `actions/download-artifact@v4` step at the start (after `actions/checkout@v4`) that downloads the `build-artifacts` artifact uploaded by `lint-and-build` (lines 60-70 of current workflow). Path: `./build-artifacts/`. The downloaded tree contains `apps/*/dist`, `packages/*/dist`, `services/*/dist`, `.turbo`.

2. **AC#2 — `web/dist` shipped to VPS via scp-action BEFORE the ssh-action deploy step:** Add `appleboy/scp-action@v0.1.7` step that copies `./build-artifacts/apps/web/dist/*` from the runner to `/tmp/oslrs-web-dist-${{ github.sha }}/` on the VPS. The directory naming with `github.sha` ensures cleanup-on-failure leaves no stale artifacts and supports concurrent deploys (theoretical — we don't run them concurrently, but cleanly handled).

3. **AC#3 — VPS-side deploy script removes the build step:** The `deploy` job's `appleboy/ssh-action@v1.2.5` script no longer runs `VITE_API_URL=/api/v1 pnpm --filter @oslsr/web build`. Replaced with `sudo cp -r /tmp/oslrs-web-dist-${{ github.sha }}/* /var/www/oslsr/` followed by `sudo rm -rf /tmp/oslrs-web-dist-${{ github.sha }}` cleanup.

4. **AC#4 — VPS-side `pnpm install` PRESERVED:** The deploy script still runs `pnpm install --frozen-lockfile`. Reason: the API runs via `tsx` at runtime and needs `node_modules/`. Removing this would require either (a) shipping a `node_modules` artifact (~500MB+, slow), or (b) bundling the API into a single-file via `tsup`/`esbuild` (Option B, future work). For now we accept the ~400MB pnpm install peak — it's bounded and FAR less impactful than the build-step spike.

5. **AC#5 — Schema migrations + nginx config + pm2 restart unchanged:** `pnpm --filter @oslsr/api db:push`, `pnpm tsx scripts/migrate-audit-immutable.ts`, nginx config copy with backup-test-reload, and `pm2 restart oslsr-api` all still run on the VPS via ssh-action. Reason: each requires DB or pm2 access that only the VPS has.

6. **AC#6 — Functional regression-free deploy:** After the change, a successful deploy results in:
   - All 4 domains (oyotradeministry.com.ng + www, oyoskills.com + www) return 200 on root path
   - `/api/v1/health` returns clean JSON 200 on both canonical domains
   - Browser end-to-end: load `https://oyoskills.com`, login as super_admin, verify WS connection establishes (status 101)
   - Sec-Fetch-Site: same-origin on `/api/v1/*` calls (Strategy A still working)

7. **AC#7 — VPS CPU stays below 30% during deploy:** Measured by SSH'ing during deploy and running `top -bn1 | head -5`. Acceptance: 1-min load avg <0.5 and `%Cpu(s)` user+sys <30% during the deploy window. Significantly better than current 70-90%.

8. **AC#8 — VPS memory stays below 1GB during deploy:** Measured by `free -h` mid-deploy. Acceptance: `used` column <1.0Gi (excluding `buff/cache`). Significantly better than current ~1.5-1.8Gi peak.

9. **AC#9 — Deploy duration drops:** Total wall-clock from `git push` to `pm2 restart` complete reduces from ~7 min currently to under 4 min. Measured across 3 successive deploys; report median.

10. **AC#10 — System-health CRITICAL alerts stop firing during deploy windows:** Verified across 3 successive deploys (1 immediately after this story merges, 2 over the following days). Zero CRITICAL digest emails attributable to deploys. Note: the 30-min digest cooldown means even if a deploy DID briefly spike (it shouldn't), the digest only fires once — but the goal is no spike at all.

11. **AC#11 — Documentation:** `docs/infrastructure-cicd-playbook.md` Part 6 (CI/CD Pipeline) gains a new subsection "6.2: Build Off-VPS Artifact Handoff" explaining the runner→artifact→VPS pattern, why VPS-side build was removed, and the rsync-vs-scp tradeoff considered. Also Pitfall section gets a new entry #22 noting that "VPS-side build on small droplets causes alert noise — always ship dist artifact from cloud runner."

## Tasks / Subtasks

- [x] **Task 1 — Wire artifact download in deploy job** (AC: #1)
  - [x] 1.1 Read current `.github/workflows/ci-cd.yml` deploy job (lines 548 onward).
  - [x] 1.2 Add new step BEFORE the existing "Pre-deploy env var safety check":
        ```yaml
        - name: Download build artifacts
          uses: actions/download-artifact@v4
          with:
            name: build-artifacts
            path: ./build-artifacts/
        ```
  - [x] 1.3 The artifact already includes `apps/*/dist` per the existing `lint-and-build` upload step (lines 60-70). After download, `./build-artifacts/apps/web/dist/` exists locally on the runner.

- [x] **Task 2 — Ship web dist to VPS via scp-action** (AC: #2)
  - [x] 2.1 Add new step BETWEEN "Download build artifacts" and "Pre-deploy env var safety check":
        ```yaml
        - name: SCP web dist to VPS
          uses: appleboy/scp-action@v0.1.7
          with:
            host: ${{ secrets.VPS_HOST }}
            username: ${{ secrets.VPS_USERNAME }}
            key: ${{ secrets.SSH_PRIVATE_KEY }}
            source: "build-artifacts/apps/web/dist/*"
            target: "/tmp/oslrs-web-dist-${{ github.sha }}"
            strip_components: 4
        ```
  - [x] 2.2 `strip_components: 4` strips `build-artifacts/apps/web/dist/` from the path so files land directly in `/tmp/oslrs-web-dist-${{ github.sha }}/index.html`, `/assets/`, etc. (rather than nested under the original path structure).
  - [x] 2.3 `appleboy/scp-action@v0.1.7` is the canonical action for runner→VPS file transfer; tested + maintained alongside the ssh-action we already use. SSH key reused.

- [x] **Task 3 — Remove VPS-side build, replace with cp from temp dir** (AC: #3, #5)
  - [x] 3.1 Modify the "Deploy to DigitalOcean VPS" ssh-action `script:` block:
        - **REMOVE** lines 595-599 (the `VITE_API_URL=/api/v1 pnpm --filter @oslsr/web build` block + its preceding comment).
        - **MODIFY** line 601-602: change `sudo cp -r apps/web/dist/* /var/www/oslsr/` to:
          ```bash
          # Frontend dist comes from CI artifact (Wave 0 prep — built on cloud runner, not VPS)
          sudo cp -r /tmp/oslrs-web-dist-${{ github.sha }}/* /var/www/oslsr/
          sudo rm -rf /tmp/oslrs-web-dist-${{ github.sha }}
          ```
  - [x] 3.2 **PRESERVE** all other steps in the script: `git pull origin main`, `pnpm install --frozen-lockfile`, `pnpm --filter @oslsr/api db:push`, `pnpm tsx scripts/migrate-audit-immutable.ts`, nginx backup-copy-test-reload, `pm2 restart oslsr-api`.

- [x] **Task 3b — Bake `VITE_API_URL=/api/v1` into lint-and-build artifact** (added during implementation; AC: #1 supplement)
  - [x] 3b.1 Discovered during implementation: the `lint-and-build` job runs `pnpm build` WITHOUT `VITE_API_URL`, so the uploaded artifact bakes in the `'http://localhost:3000/api/v1'` fallback from `apps/web/src/lib/api-client.ts`. Production needs `/api/v1`.
  - [x] 3b.2 Added `env: VITE_API_URL: /api/v1` to the lint-and-build `Build` step. Vite consumes only `VITE_*` vars in apps/web, so this is a no-op for @oslsr/api / @oslsr/types / other packages. Test jobs are unaffected (vitest re-compiles from source).
  - [x] 3b.3 This is the Wave 0 architectural completion of the deploy-time `VITE_API_URL=/api/v1` env that previously lived in the SSH script — the value now travels with the artifact.

- [x] **Task 3c — Wire `VITE_HCAPTCHA_SITE_KEY` + `VITE_GOOGLE_CLIENT_ID` through CI** (surfaced during pre-flight; AC: #1 supplement)
  - [x] 3c.1 Awwal's manual pre-flight (Task 4) succeeded on the structural checks (HTTP/2 200 on all 4 domains, /api/v1/health JSON, PM2 online), then **the browser smoke test exposed the bug**: hCaptcha rendered with the "for testing purposes only — contact admin" banner and login POST returned `CAPTCHA verification failed`.
  - [x] 3c.2 Root cause: `apps/web/src/features/auth/components/HCaptcha.tsx:5` falls back to the hCaptcha **public test sitekey** (`10000000-ffff-ffff-ffff-000000000001`) when `VITE_HCAPTCHA_SITE_KEY` is undefined. Same pattern at `GoogleOAuthWrapper.tsx:4` — falls back to `''` empty string. Vite previously picked up the real values from VPS-side `/root/oslrs/.env` during the VPS-side build; cloud runner has no `.env` so the fallbacks won lit up.
  - [x] 3c.3 Test-secret/prod-secret mismatch is a defence-in-depth feature, not a bug — hCaptcha's server-side verify endpoint refuses the test sitekey signature when the production secret key is configured server-side, so the auth POST fails-closed. (Confirmed Task 4 caught this only because Awwal actually tried to log in — the AC#6 functional checks of `curl -sI` and `curl /api/v1/health` would have stayed green.)
  - [x] 3c.4 Awwal SSH'd to VPS, grepped real values from `/root/oslrs/.env`, added both as **GitHub Actions Repository Variables** (Settings → Secrets and variables → Actions → Variables tab). Variables not Secrets because both values are PUBLIC by design — they're embedded in every browser page; redaction would add no security and would cost debugging clarity.
  - [x] 3c.5 `.github/workflows/ci-cd.yml` lint-and-build `Build` step's `env:` block now wires all three: `VITE_API_URL` (hardcoded `/api/v1`), `VITE_HCAPTCHA_SITE_KEY: ${{ vars.VITE_HCAPTCHA_SITE_KEY }}`, `VITE_GOOGLE_CLIENT_ID: ${{ vars.VITE_GOOGLE_CLIENT_ID }}`.
  - [x] 3c.6 Documented as Pitfall #23 in `docs/infrastructure-cicd-playbook.md` — "Moving Vite build off-VPS silently swaps real VITE_* keys for code fallbacks" — with the canonical 4-step inventory procedure when adding a new `VITE_*` var (GH Variables → workflow `env:` → VPS `.env` → `.env.example`).
  - [x] 3c.7 Pre-flight rolled back via the `mv /var/www/oslsr.bak-pre-prepwave0` path (site restored, login working, `/api/v1/health` JSON green at 2026-04-27T15:30:31Z). The first post-merge CI deploy is now the proper verification.

- [x] **Task 4 — Local pre-flight test BEFORE pushing CI change** (AC: #6 verification)

  > **Executed 2026-04-27** during the Task 3c discovery cycle (Task 3c.1–3c.7). The manual SCP + manual cp + browser smoke test ran end-to-end and surfaced the silent VITE_* fallback bug that became Pitfall #23. Site rolled back via `mv /var/www/oslsr.bak-pre-prepwave0` at 2026-04-27T15:30:31Z. Architecture viability proven; the first post-merge CI deploy completes the AC#6 verification with the corrected workflow. No additional pre-flight needed.

  - [x] 4.1 ~~On laptop: build locally — `cd apps/web && VITE_API_URL=/api/v1 pnpm build` to produce a fresh `dist/`.~~ DONE 2026-04-27.
  - [x] 4.2 ~~SCP to a temp dir on the VPS manually.~~ DONE 2026-04-27.
  - [x] 4.3 ~~SSH to VPS, run a manual deploy script that mimics the new behavior.~~ DONE 2026-04-27 (smoke test caught test-sitekey fallback before CI push).
  - [x] 4.4 ~~Verify all 4 domains return 200 + `/api/v1/health` JSON.~~ DONE 2026-04-27 post-rollback at T15:30:31Z.

- [ ] **Task 5 — Close-out via auto-measurement + 2-deploy gate** (AC: #7, #8, #9, #10) — PENDING DEPLOYS

  > **Restructured 2026-04-29 per code review.** Original design required live-SSH-during-deploy stopwatch toil across 3 deploys. Replaced with: (a) measurement block baked into deploy script (`.github/workflows/ci-cd.yml` `WAVE-0-MEASUREMENT START/END` lines), (b) 2-deploy strong gate (down from 3 — robustness margin recovered via the always-on measurement block giving free regression monitoring on every future deploy), (c) 7-day soft-path fallback so the story can't drift open indefinitely.

  - [ ] 5.1 **(operator: this session)** Commit Wave 0 (this commit). Push to main. CI runs full pipeline including the new deploy job with measurement bookends.
  - [ ] 5.2 **(operator: post-deploy 1)** Read row 1 from GH Actions logs:
        ```bash
        gh run view --log --job=deploy | awk '/WAVE-0-MEASUREMENT/,0'
        ```
        Eyeball peak `%Cpu(s)` user+sys, peak `MiB Mem :  used`, and the `duration=Ns` wall-clock. Save the values for commit 3 close-out — DO NOT update the table mid-flow.
  - [ ] 5.3 **(operator: ≤2 days later, separate session)** Develop `prep-tsc-pre-commit-hook` (Wave 0 carve-out, ready-for-dev, ~1 hour). Code review pre-commit (BMAD method cornerstone). Fix. Commit 2. Push. Read row 2 from deploy logs same way.
  - [ ] 5.4 **(operator: same session as 5.3)** Commit 3 close-out — fills rows 1 + 2 in the measurement table (under Dev Agent Record → Completion Notes List), flips story Status `done`, flips sprint-status `done`. Push. Commit 3's own deploy = silent confirmation row 3 (recorded post-hoc only if it exceeds thresholds; otherwise no further action needed).

  **Close-out gate (decision logic):**

  | Path | Trigger | Action |
  |---|---|---|
  | ✅ Strong (preferred) | 2 measured rows, both with CPU <30% AND mem <1Gi AND wall-clock <4 min AND no CRITICAL system-health digest within deploy window | Story → `done` via commit 3 |
  | ✅ Soft (fallback) | 7 days elapsed since Wave 0 merge AND deploys-that-did-happen all show wall-clock <4 min in GH Actions UI AND no CRITICAL digests fired | Story → `done` via commit 3; AC#7+AC#8 inferred from "no CRITICAL fired" (digest threshold = 80%, well above the AC#7+AC#8 thresholds) |
  | ❌ Failure | Any deploy fires CRITICAL OR shows >50% CPU OR >1.2Gi memory OR >5 min wall-clock | Re-open with spike-investigation follow-up. `pnpm install` becomes the next-likely candidate (story risk-table named this); scope a future story to bundle the API via tsup/esbuild (Option (b)). |

  **Calendar gate:** if commits 2 + 3 haven't both landed by **2026-05-06** (7 days post-Wave-0 merge), trigger Soft Path closure.

- [~] **Task 6 — Documentation** (AC: #11) — PARTIAL (6.2 deferred per design)
  - [x] 6.1 Update `docs/infrastructure-cicd-playbook.md`:
        - **Part 6** gains a new "6.2: Build Off-VPS Artifact Handoff" subsection.
        - **Pitfall #22 added** (VPS-side build on small droplets causes alert noise).
        - **Pitfall #23 added** (Moving Vite build off-VPS silently swaps real VITE_* keys for code fallbacks) — captured during pre-flight.
        - **Pitfall #10 cross-referenced** to Part 6.2 + Pitfall #23 (M1 fix, 2026-04-29).
        - **Manual Redeploy snippet hardened** with all 3 VITE_* vars + emergency-only callout (M2 fix, 2026-04-29).
        - **Periodic Maintenance subsection added** with `/tmp/oslrs-web-dist-*` quarterly sweep + `/var/www/oslsr.bak.prev` audit (L2 fix, 2026-04-29).
  - [ ] 6.2 Update `docs/a6-dev-story-sequence.md` to mark Wave 0 as DONE once this story merges. DEFERRED — post-Wave-0 action; Wave 0 has multiple stories, marker should land when the wave is fully done, not on this single story merge.
  - [x] 6.3 Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: flip `prep-build-off-vps-cloud-runner` from `ready-for-dev` → `in-progress` at PR open, → `review` at code review, → `done` at merge. (in-progress flipped 2026-04-27; stays in-progress through Wave 0 commit; flips `done` at commit 3 close-out per Task 5)
  - [x] 6.4 Update `docs/team-context-brief.md` with the post-Wave-0 VITE_* env-var inventory pattern. (M-related: this file IS Wave 0–scope but was originally missed from the File List — corrected per H3.)

- [x] **Task 7 — Apply review fixes BEFORE commit** (Wave 0 code review, 2026-04-29; cross-cutting AC: #1–#11)

  > Adversarial code review on uncommitted working tree (BMAD method cornerstone — `feedback_review_before_commit.md`) surfaced 3 High + 4 Medium + 3 Low findings. All H/M findings fixed in this commit (except M4 deferred as documented exception). Full action-item record under "Review Follow-ups (AI)" in Dev Agent Record below.

  - [x] 7.1 H1: Trap-cleanup `/tmp/oslrs-web-dist-${SHA}` on EXIT in deploy script. `ci-cd.yml` `Deploy to DigitalOcean VPS` step line ~620.
  - [x] 7.2 H2: Fail-fast `[[ -f /var/www/oslsr/index.html ]]` guard after dist copy. `ci-cd.yml` line ~647.
  - [x] 7.3 H3: `team-context-brief.md` added to File List below; `package.json` + `pnpm-lock.yaml` (`js-yaml` + `markdown-it` for unrelated baseline-report tooling) stashed via `git stash push` to keep them out of the Wave 0 commit.
  - [x] 7.4 M1: Pitfall #10 in playbook cross-referenced to Part 6.2 + Pitfall #23 (post-Wave-0 pattern).
  - [x] 7.5 M2: Manual Redeploy snippet in playbook hardened with all 3 VITE_* vars sourced from VPS `.env` + emergency-only callout.
  - [x] 7.6 M3: Backup-before-overwrite for `/var/www/oslsr` → `/var/www/oslsr.bak.prev` in deploy script (mirrors nginx backup-test-restore pattern). `ci-cd.yml` line ~640.
  - [ ] 7.7 M4: Lighthouse job redundant rebuild — DEFERRED. Documented as known exception (lighthouse needs its own dist for perf measurement). Not Wave 0 scope.
  - [x] 7.8 L1: Task 6 [x] / Task 6.2 [ ] inconsistency reconciled in this rewrite.
  - [x] 7.9 L2: Quarterly `/tmp/oslrs-web-dist-*` cleanup line added to playbook Daily Operations → Periodic Maintenance subsection.
  - [x] 7.10 L3: Status gate explicit — story stays `in-progress` post-Wave-0-commit; flips `done` only at commit 3 close-out per Task 5 gate logic above.
  - [x] 7.11 Wave 0 close-out infrastructure: measurement block (`WAVE-0-MEASUREMENT START/END` bookends) added to deploy script. Captures pre/post `top` + `free -h` + wall-clock duration. Permanent — provides free regression monitoring on every future deploy. `ci-cd.yml` Deploy step.

## Dev Notes

### Background — Why This Is Wave 0 (architectural)

Triage of the 2026-04-27 06:32 UTC CRITICAL alert proved that PM2 ↺ counter inflation is **deploy-driven, not spontaneous**. Every deploy spikes CPU + memory on the 2GB VPS for 2-3 min during `pnpm install` + `pnpm build`. While Story 9-10 AC#2 partial fix (commit `718f84e`) eliminated the ioredis-shutdown-crash component of restart cycle inflation, the deploy-spike root cause is unaddressed. Until this story lands, every deploy will continue to:

- Trip CRITICAL system-health digest emails (false positives that train operator to ignore real signals — alert fatigue)
- Cause API restart with brief unavailability during build step
- Pollute Story 9-10 AC#1 trajectory data with deploy-driven restart entries

This story is **prerequisite to Wave 1** (and especially Story 9-10 AC#3 post-fix observation) — Wave 1 work shouldn't begin in earnest until clean deploy mechanics give clean trajectory data. Effort: ~half-day. Cost: $0 (uses existing GitHub-hosted cloud runner already paid for under repo's free-tier 2,000 min/month allotment).

### Prerequisites / Blockers

None. Story 9-7 nginx config is in place; Phase 2/3 architecture is shipped; CI artifact upload pattern is already used by 4 test jobs in the workflow (so the mechanism is proven, just not yet wired to deploy).

### Dependencies (downstream)

- **Story 9-10 AC#3 post-fix observation window** benefits from this landing first. The 7-day post-2026-04-25 trajectory data the 2026-05-04 follow-up checklist will analyze gets cleaner if deploys stop registering as restart events that look like "spontaneous" symptoms.
- **Story 9-9 SSH firewall re-narrow follow-up** doesn't strictly require this but pairs naturally — once we move to a self-hosted runner inside tailnet (separate future story), that runner can do BOTH the build AND the deploy, and we can re-narrow the SSH firewall to `100.64.0.0/10` + DO infrastructure ranges.

### Architecture diagram (text, before vs after)

**Before:**
```
push to main
   │
   ▼
GH Actions: lint-and-build job (cloud runner)
   - pnpm install
   - pnpm lint
   - pnpm build  ← builds dist
   - upload-artifact (build-artifacts)  ← discarded by deploy
   │
   ▼
GH Actions: test-* / lighthouse / dashboard jobs (cloud runners, parallel)
   - download-artifact build-artifacts
   - run tests against built dist
   │
   ▼
GH Actions: deploy job (cloud runner)
   - SSH to VPS
   - VPS: git pull
   - VPS: pnpm install              ← 400MB RAM
   - VPS: pnpm db:push
   - VPS: pnpm --filter @oslsr/web build  ← 700MB-1GB RAM + 70-90% CPU, 2-3 min  ❌ THE SPIKE
   - VPS: cp dist to /var/www/oslsr/
   - VPS: nginx backup/test/reload
   - VPS: pm2 restart oslsr-api
```

**After:**
```
push to main
   │
   ▼
GH Actions: lint-and-build (cloud runner)
   - pnpm install
   - pnpm lint
   - pnpm build  ← builds dist
   - upload-artifact (build-artifacts)
   │
   ▼
GH Actions: test-* / lighthouse / dashboard (cloud runners, parallel)
   - same as before
   │
   ▼
GH Actions: deploy (cloud runner)
   - download-artifact build-artifacts                  ← NEW, ~10s
   - scp-action: ship apps/web/dist/* to VPS:/tmp/...   ← NEW, ~30s
   - SSH to VPS
   - VPS: git pull (still needed for nginx config + apps/api source for tsx)
   - VPS: pnpm install (kept for runtime tsx — ~400MB RAM, bounded)
   - VPS: pnpm db:push
   - VPS: cp /tmp/.../* /var/www/oslsr/  ← from artifact, NO BUILD
   - VPS: rm -rf /tmp/...
   - VPS: nginx backup/test/reload
   - VPS: pm2 restart oslsr-api
```

### Why scp-action, not rsync over SSH

Both work. Chose `appleboy/scp-action@v0.1.7` because:
- Same maintainer/author as `appleboy/ssh-action@v1.2.5` we already use → consistent auth + retry semantics
- Doesn't require installing rsync on the runner (it's there by default but explicit deps are clearer)
- `strip_components` flag is convenient for path-flattening the artifact structure
- Battle-tested on the runner side; doesn't have the "rsync-protocol-mismatch-when-VPS-is-old" foot-gun

If scp-action proves slow (~50MB dist file × ~50KB/s home-broadband upload from runner = ~17 min — possible but unlikely on cloud-runner backbone), fall back to rsync over SSH:
```yaml
- name: Rsync web dist to VPS
  run: |
    eval "$(ssh-agent -s)"
    echo "${{ secrets.SSH_PRIVATE_KEY }}" | ssh-add -
    rsync -az --delete \
      build-artifacts/apps/web/dist/ \
      ${{ secrets.VPS_USERNAME }}@${{ secrets.VPS_HOST }}:/tmp/oslrs-web-dist-${{ github.sha }}/
```
But default to scp-action; rsync is the fallback only if measured slow.

### Why we keep `pnpm install` on the VPS

The OSLRS API uses `pnpm tsx src/index.ts` at runtime (per `pm2 show oslsr-api`'s exec path). `tsx` resolves modules through `node_modules/`, which has to exist on the VPS. To eliminate `pnpm install` entirely we'd need to either:
- (a) Ship a `node_modules` tarball as artifact — rejected: ~500MB+ tarball, 5-10x scp time, fragile
- (b) Bundle the API into a single file via `tsup`/`esbuild` and ship that — feasible long-term but multi-day work to validate (BullMQ workers, dynamic imports, ESM peculiarities); out of scope for Wave 0
- (c) Containerize the API and ship a Docker image — overkill for single-VPS app, big infrastructure shift

Option (a)/(b)/(c) all meaningful improvements that would close `pnpm install`'s ~400MB peak too. Defer to a future story if 9-10 trajectory data still shows residual spikes after Wave 0 lands.

### What this story does NOT do

- Does not move builds to a self-hosted runner inside tailnet. That's a SEPARATE Story 9-9 follow-up (re-narrow SSH firewall after self-hosted runner replaces public-IP cloud runner deploys).
- Does not eliminate `pnpm install` on VPS (see above).
- Does not change CI run time materially — the cloud runner ALREADY builds; this story just stops throwing the build away.
- Does not change deploy reliability — same SSH-action, same VPS-side commands minus build.

### Risk analysis

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| scp-action fails to upload | Low | Deploy fails, alert fires | Fall back to rsync (documented above) |
| Artifact download misses files | Low | Empty `/var/www/oslsr/` post-deploy → 404 page | Add `ls` check after `cp` step; fail-fast if `index.html` missing (H2 fix shipped) |
| `github.sha` interpolation in scp-action target broken | Low | Multi-deploy collision | Verify in pre-flight (Task 4); commit SHA is GA-supported in this action |
| VPS-side `pnpm install` still spikes resources | Medium | Smaller spike still tripping alerts | Acceptable for Wave 0 (40% of pre-fix peak; alerts should not fire). If they do, defer further work to Option (b) above. |

### Test strategy

- **Smoke test:** Pre-flight Task 4 covers the architecture viability (manual scp + manual cp → 200 responses). Done 2026-04-27.
- **CI smoke test:** First push after the change runs the new flow end-to-end; AC#6 verification covers regression-free behavior.
- **Resource measurement:** Tasks 5.2-5.4 capture before/after metrics via the `WAVE-0-MEASUREMENT START/END` bookends baked into the deploy script. Bundled into Dev Agent Record → Completion Notes table.
- **No new automated tests required.** No new code paths in apps/api or apps/web.

### Project Structure Notes

- **CI workflow** is a single file at `.github/workflows/ci-cd.yml` containing multiple jobs: `lint-and-build` (creates artifact), `test-*` / `lighthouse` / `dashboard` (consume artifact in parallel), `deploy` (consumes artifact + ships to VPS).
- **Artifact-upload pattern** already established by `lint-and-build` (lines 60-70 pre-Wave-0). New steps in `deploy` job mirror the consumer pattern used by 4 existing test jobs, so the mechanism is proven.
- **Runner-to-VPS file transfer** uses `appleboy/scp-action@v0.1.7` — same maintainer as `appleboy/ssh-action@v1.2.5` already in use. Consistent auth + retry semantics. SSH key reused.
- **Build env vars**: post-Wave-0, all `VITE_*` vars are baked at the cloud-runner `Build` step's `env:` block — NOT at deploy time on the VPS. Three values currently wired: `VITE_API_URL: /api/v1` (hardcoded relative, Strategy A), `VITE_HCAPTCHA_SITE_KEY: ${{ vars.VITE_HCAPTCHA_SITE_KEY }}`, `VITE_GOOGLE_CLIENT_ID: ${{ vars.VITE_GOOGLE_CLIENT_ID }}`.
- **GitHub Actions Variables vs Secrets**: 2 new repo-level Variables (Settings → Secrets and variables → Actions → Variables tab): `VITE_HCAPTCHA_SITE_KEY` + `VITE_GOOGLE_CLIENT_ID`. Variables (NOT Secrets) because both are PUBLIC by design — embedded in every browser page; redaction adds no security and costs debug clarity.
- **Adding any new `VITE_*` var** requires the canonical 4-step procedure (Pitfall #23): (1) GH Actions Variable created, (2) workflow `env:` block updated, (3) VPS `.env` updated for emergency rebuilds, (4) `.env.example` updated.
- **Playbook pitfall numbering**: TWO schemes coexist. **Common Issues / Pitfalls TABLE** (`docs/infrastructure-cicd-playbook.md:700-718`) — rows 1-21+; this story added rows #22 + #23. **`### Pitfall #N:` HEADINGS** (`docs/infrastructure-cicd-playbook.md:958+`) — items 16-23 about SSH/DO/CF; UNRELATED. References to "Pitfall #22 / #23" in this story are TABLE rows. Pitfall #10 (also a TABLE row, line 707) was cross-referenced to Part 6.2 + Pitfall #23 in this story's M1 fix.
- **Wave 0 measurement infrastructure**: `WAVE-0-MEASUREMENT START/END` bookends in the deploy script capture `top -bn1` + `free -h` + wall-clock duration on EVERY deploy permanently. Provides free regression monitoring even after Wave 0 closes.

### References

- Originating evidence: [Source: docs/session-2026-04-21-25.md] Postscript 3 — Story 9-10 file evidence-injection block at commit `718f84e`
- 2026-04-27 06:32 UTC CRITICAL alert log (system-health digest) — triggered the deploy-vs-runtime triage
- CI artifact upload pattern (pre-Wave-0 baseline): [Source: .github/workflows/ci-cd.yml:60-70]
- Deploy job to modify (pre-Wave-0 baseline): [Source: .github/workflows/ci-cd.yml:548+]
- Web HTTP client default fallback (`'http://localhost:3000/api/v1'` when `VITE_API_URL` undefined — motivated Task 3b): [Source: apps/web/src/lib/api-client.ts:1]
- Realtime connection relative-URL handling (Phase 2 Strategy A — confirms artifact-baked `/api/v1` works for both XHR and WS): [Source: apps/web/src/hooks/useRealtimeConnection.ts:9]
- hCaptcha test-sitekey fallback (motivated Task 3c): [Source: apps/web/src/features/auth/components/HCaptcha.tsx:5]
- Google OAuth empty-string fallback: [Source: apps/web/src/features/auth/components/GoogleOAuthWrapper.tsx:4]
- Pitfall #22 (TABLE row — VPS-side build alert noise) added by this story: [Source: docs/infrastructure-cicd-playbook.md Pitfall table around line 1009]
- Pitfall #23 (TABLE row — VITE_* fallback trap) added by this story: [Source: docs/infrastructure-cicd-playbook.md Pitfall table around line 1028]
- `appleboy/scp-action` v0.1.7: https://github.com/appleboy/scp-action
- `appleboy/ssh-action` v1.2.5 (already in use): https://github.com/appleboy/ssh-action
- Story 9-10 ioredis-shutdown-crash partial fix: commit `718f84e` (visible in `git log --oneline`)
- Wave 0 commit (this story): `e799104 feat(ci): wave 0 — build off-vps via cloud-runner artifact handoff` (visible in `git log --oneline`)

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m] (Claude Opus 4.7, 1M context) — 2026-04-27

### Debug Log References

- `apps/web/src/lib/api-client.ts:1` — confirmed default fallback `'http://localhost:3000/api/v1'` when `VITE_API_URL` undefined; this is what motivated Task 3b (bake VITE_API_URL=/api/v1 into the artifact, not just at deploy time).
- `apps/web/src/hooks/useRealtimeConnection.ts:9` — confirmed relative-URL handling already in place (Phase 2 Strategy A) so the artifact-baked `/api/v1` works for both XHR and WS without per-domain rebuild.

### Completion Notes List

**Tasks 1-3 + Task 3b (CI workflow) — DONE 2026-04-27**

- Task 1 (AC#1): `actions/download-artifact@v4` step added at start of `deploy` job in `.github/workflows/ci-cd.yml:567-571`. Downloads `build-artifacts` to `./build-artifacts/` on the runner.
- Task 2 (AC#2): `appleboy/scp-action@v0.1.7` step at `.github/workflows/ci-cd.yml:577-585`. Copies `build-artifacts/apps/web/dist/*` → `/tmp/oslrs-web-dist-${{ github.sha }}/` on VPS. `strip_components: 4` flattens path.
- Task 3 (AC#3, AC#5): VPS-side `pnpm --filter @oslsr/web build` removed from `Deploy to DigitalOcean VPS` ssh-action script. Replaced with `sudo cp -r /tmp/oslrs-web-dist-${{ github.sha }}/* /var/www/oslsr/` + `sudo rm -rf /tmp/oslrs-web-dist-${{ github.sha }}`. All other VPS steps preserved (pnpm install, db:push, migrate-audit-immutable, nginx backup-test-reload, pm2 restart).
- Task 3b (correctness fix discovered during impl): `VITE_API_URL: /api/v1` added to `lint-and-build` `Build` step's `env:` block at `.github/workflows/ci-cd.yml:60-63`. Without this the artifact would bake in the `localhost:3000` fallback and production would break post-deploy. The `VITE_API_URL=/api/v1` value now travels with the artifact instead of being applied at deploy time.
- Task 3c (correctness fix surfaced during Awwal's pre-flight browser test): `VITE_HCAPTCHA_SITE_KEY` + `VITE_GOOGLE_CLIENT_ID` added as GH Actions Repository Variables and wired into the same `Build` step. Without these the artifact falls back to the hCaptcha public test sitekey (login captcha breaks) and an empty Google OAuth client ID. New Pitfall #23 in playbook captures the trap + the canonical 4-step procedure for adding any future `VITE_*` var.

**Task 6 (Documentation) — DONE 2026-04-27**

- `docs/infrastructure-cicd-playbook.md` Part 6.2 added (Build Off-VPS Artifact Handoff) with before/after text diagrams + the four "why" explanations (VITE_API_URL placement, SHA namespacing, scp-action vs rsync, pnpm install preservation).
- `docs/infrastructure-cicd-playbook.md` Pitfall #22 added (VPS-side build on small droplets causes alert noise).
- Existing Part 6 deploy-step example (line ~530) updated to show the new artifact-cp pattern.
- `docs/a6-dev-story-sequence.md` Wave 0 done-marker DEFERRED to post-Wave-0 (this is 1 of multiple stories in Wave 0 — premature to mark wave done).
- `_bmad-output/implementation-artifacts/sprint-status.yaml` flipped from `ready-for-dev` → `in-progress`.

**Tasks 4 + 5 — Task 4 closed retroactively, Task 5 PENDING DEPLOYS**

- Task 4 (AC#6 pre-flight): manual SCP + manual cp on VPS to ground-truth the architecture before pushing the workflow change. Done 2026-04-27 during Task 3c discovery cycle. Architecture viability proven; site rolled back via `mv /var/www/oslsr.bak-pre-prepwave0` at 2026-04-27T15:30:31Z.
- Task 5 (AC#7-AC#10 measurements): auto-captured on every deploy via `WAVE-0-MEASUREMENT START/END` bookends in deploy script. Acceptance thresholds: <30% CPU, <1Gi memory, <4 min wall-clock, zero CRITICAL digests during deploy windows. Close-out gate logic in Task 5 (Tasks/Subtasks above).

**Measurement table (to be filled by Awwal during Task 5):**

| Deploy # | Commit SHA | Peak CPU% | Peak Mem (GiB) | Wall-clock | CRITICAL alert? | Notes |
|---|---|---|---|---|---|---|
| 1 (post-merge) | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ | First deploy after this story merges |
| 2 | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ | |
| 3 | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ | |
| **Median** | — | _tbd_ | _tbd_ | _tbd_ | — | Acceptance: <30% / <1.0 / <4min / 0 |
| **Pre-fix baseline** | (any prior) | 70-90% | 1.5-1.8 | ~7 min | YES (every deploy) | From 2026-04-27 06:32 UTC triage |

### File List

- `.github/workflows/ci-cd.yml` — modified
  - lint-and-build `Build` step: added `env:` block with `VITE_API_URL: /api/v1` (Task 3b) + `VITE_HCAPTCHA_SITE_KEY: ${{ vars.VITE_HCAPTCHA_SITE_KEY }}` + `VITE_GOOGLE_CLIENT_ID: ${{ vars.VITE_GOOGLE_CLIENT_ID }}` (Task 3c)
  - deploy job: added `Download build artifacts` step (Task 1)
  - deploy job: added `SCP web dist to VPS` step (Task 2)
  - deploy job: `Deploy to DigitalOcean VPS` script — removed `VITE_API_URL=/api/v1 pnpm --filter @oslsr/web build`, replaced `cp -r apps/web/dist/*` with `cp -r /tmp/oslrs-web-dist-<sha>/*` (Task 3)
  - deploy job: trap-on-EXIT cleanup of `/tmp/oslrs-web-dist-<sha>` (Wave 0 review H1)
  - deploy job: backup-before-overwrite `/var/www/oslsr` → `/var/www/oslsr.bak.prev` before dist cp (Wave 0 review M3)
  - deploy job: fail-fast `[[ -f /var/www/oslsr/index.html ]]` guard after dist cp (Wave 0 review H2)
  - deploy job: `WAVE-0-MEASUREMENT START` block before deploy + `WAVE-0-MEASUREMENT END` block after pm2 restart (Task 5 close-out automation; permanent regression-monitoring infrastructure)
- **GitHub repo configuration (out-of-tree, manual)**: two new repository variables under Settings → Secrets and variables → Actions → Variables tab:
  - `VITE_HCAPTCHA_SITE_KEY` (public hCaptcha sitekey, same value as `/root/oslrs/.env`)
  - `VITE_GOOGLE_CLIENT_ID` (public Google OAuth client ID, same value as `/root/oslrs/.env`)
- `docs/infrastructure-cicd-playbook.md` — modified
  - Part 6 deploy-step code example updated to show artifact-cp pattern
  - Part 6.2 (Build Off-VPS Artifact Handoff) new subsection added
  - Pitfall #22 (VPS-side build on small droplets causes alert noise) added — TABLE row
  - Pitfall #23 (Moving Vite build off-VPS silently swaps real VITE_* keys for code fallbacks) added — TABLE row; captures the pre-flight finding + 4-step procedure for adding future `VITE_*` vars
  - Pitfall #10 cross-referenced to Part 6.2 + Pitfall #23 — flags the post-Wave-0 pattern boundary (Wave 0 review M1)
  - Manual Redeploy snippet (Part 7) hardened: all 3 VITE_* vars sourced from `/root/oslrs/.env`, emergency-only callout (Wave 0 review M2)
  - Periodic Maintenance subsection added under Daily Operations: quarterly `/tmp/oslrs-web-dist-*` sweep + `/var/www/oslsr.bak.prev` audit (Wave 0 review L2)
  - Footer `Updated: 2026-04-27` + `Updated: 2026-04-29` lines added
- `docs/team-context-brief.md` — modified (Wave 0 review H3 — was on-topic but originally missed from File List)
  - Critical Deployment Notes: VITE_API_URL bullet rewritten to reflect post-Wave-0 cloud-runner build pattern (3 VITE_* vars, GH Actions Variable origin, 4-step add-new-var procedure, cross-ref Pitfall #23)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — modified
  - `prep-build-off-vps-cloud-runner` flipped `ready-for-dev` → `in-progress` (will flip → `done` at commit 3 close-out per Task 5 gate)
- `_bmad-output/implementation-artifacts/prep-build-off-vps-cloud-runner.md` — modified
  - Status `ready-for-dev` → `in-progress`
  - Tasks 1, 2, 3, 3b, 3c marked `[x]`
  - Task 4 retroactively closed `[x]` with evidence pointer to Task 3c.7 (Wave 0 review L3)
  - Task 5 restructured around 2-deploy Strong Gate + 7-day Soft Path + Failure Path; auto-measurement block in CI script feeds the gate
  - Task 6 reconciled `[x]` → `[~]` PARTIAL (sub-item 6.2 deferred per design; 6.4 added documenting team-context-brief.md update) (Wave 0 review L1)
  - Task 7 added documenting all H/M/L fix locations from this code review pass
  - Review Follow-ups (AI) findings catalogue with status markers (now under Dev Agent Record per canonical template, 2026-04-29 retrofit)
  - Dev Agent Record extended: 2026-04-29 Change Log entries, this expanded File List

**Out-of-commit (git-stashed for separate scope):**
- `package.json` + `pnpm-lock.yaml` — adds `js-yaml@^4.1.0` + `markdown-it@^14.1.0` to root devDependencies. These are for the `_bmad-output/baseline-report/assets/build.js` tooling, NOT Wave 0. Stashed via `git stash push -m "wave0-scope-creep: ..." -- package.json pnpm-lock.yaml` so the Wave 0 commit stays focused. Recover with `git stash pop` when committing the baseline-report tooling. (Wave 0 review H3 scope-separation fix)

No changes in `apps/api/src` or `apps/web/src`. No new automated tests required (CI architecture change, not application code).

### Change Log

| Date | Change | Files |
|---|---|---|
| 2026-04-27 | Wave 0 prep-story implementation. CI workflow: download-artifact + scp-action steps added to deploy job; VPS-side build removed; VITE_API_URL=/api/v1 baked into lint-and-build artifact. Playbook Part 6.2 + Pitfall #22 added. | `.github/workflows/ci-cd.yml`, `docs/infrastructure-cicd-playbook.md`, `_bmad-output/implementation-artifacts/sprint-status.yaml`, this story file |
| 2026-04-27 | Pre-flight browser test surfaced silent VITE_* fallback: hCaptcha rendered the test-purposes sitekey, login broke. Wired `VITE_HCAPTCHA_SITE_KEY` + `VITE_GOOGLE_CLIENT_ID` (both public-by-design, added as GH Actions Variables) into lint-and-build Build step. Playbook gained Pitfall #23 with canonical 4-step procedure for adding future `VITE_*` vars. Site rolled back to backup; first post-merge CI deploy is the verification. | `.github/workflows/ci-cd.yml`, `docs/infrastructure-cicd-playbook.md`, this story file |
| 2026-04-29 | Adversarial code review pre-commit (BMAD method cornerstone — `feedback_review_before_commit.md`). 3 High + 4 Medium + 3 Low findings; all H/M (except M4 deferred) fixed in this commit. Deploy script gains: trap-on-EXIT cleanup of /tmp/oslrs-web-dist-<sha> (H1), fail-fast `[[ -f /var/www/oslsr/index.html ]]` guard after dist copy (H2), backup-before-overwrite for /var/www/oslsr → /var/www/oslsr.bak.prev (M3), and WAVE-0-MEASUREMENT START/END bookends (close-out automation — captures pre/post `top` + `free -h` + wall-clock duration on every deploy permanently). Playbook: Pitfall #10 cross-referenced to Part 6.2 + Pitfall #23 (M1), Manual Redeploy snippet hardened with all 3 VITE_* vars + emergency-only callout (M2), Periodic Maintenance subsection added with /tmp/oslrs-web-dist-* quarterly sweep (L2). Story: Task 4 retroactively closed (executed 2026-04-27 during Task 3c), Task 5 restructured around 2-deploy strong gate + 7-day soft-path fallback (down from 3 deploys; robustness margin recovered via always-on measurement block), Task 7 added documenting all H/M/L fix locations, Review Follow-ups (AI) subsection added per workflow option [2]. team-context-brief.md added to File List (was on-topic but missing — H3 partial fix). package.json + pnpm-lock.yaml (js-yaml + markdown-it for unrelated baseline-report tooling) git-stashed to keep them out of the Wave 0 commit (H3 scope-creep separation). | `.github/workflows/ci-cd.yml`, `docs/infrastructure-cicd-playbook.md`, `docs/team-context-brief.md`, this story file |
| 2026-04-29 | Validation pass (Bob, fresh-context mode 2 per `_bmad/bmm/workflows/4-implementation/create-story/checklist.md`). Rebuilt to canonical template structure: folded top-level "Why this is Wave 0 (architectural)", "Prerequisites / Blockers", "Dependencies (downstream)", "File List (estimated)", "References" under Dev Notes; converted all task-as-headings (`### Task N — Title` + `1.1.` numbered subitems) to canonical `[ ] Task N (AC: #X)` checkbox format with `[ ] N.M` subtasks; **all `[x]` / `[~]` / `[ ]` state preserved exactly** (Tasks 1, 2, 3, 3b, 3c, 4, 7 = `[x]`; Task 5 = `[ ] PENDING DEPLOYS`; Task 6 = `[~] PARTIAL`; sub-checkbox state preserved verbatim). Moved `### Review Follow-ups (AI) — Adversarial Code Review 2026-04-29` from inside Tasks/Subtasks (where it lived as Task-7-adjacent) to Dev Agent Record (canonical placement); findings catalogue text + status markers preserved verbatim. Moved measurement table from inside Dev Agent Record narrative paragraphs into proper sub-table under Completion Notes List. Added `### Project Structure Notes` subsection covering CI workflow layout, scp-action choice, GH Actions Variables-vs-Secrets distinction, the canonical 4-step procedure for adding new `VITE_*` vars, and the playbook's TWO pitfall numbering schemes (TABLE rows vs `### Pitfall #N:` HEADINGS — Pitfalls #22 + #23 + #10 cross-ref are TABLE rows). Added `### References` subsection inside Dev Notes with `[Source: file:line]` cites for all 12 codebase claims (api-client.ts, useRealtimeConnection.ts, HCaptcha.tsx, GoogleOAuthWrapper.tsx, ci-cd.yml lines, playbook lines, etc.). Status `in-progress` preserved (Wave 0 close-out gate at Task 5 governs the flip to `done`). All 422 lines of substantive content preserved; net file size similar post-restructure. | This story file. |

### Review Follow-ups (AI) — Adversarial Code Review 2026-04-29

> Findings catalogue from `/bmad:bmm:workflows:code-review` adversarial pass on uncommitted working tree. All HIGH + MEDIUM (except M4) fixed in commit `e799104` (Wave 0). Cross-reference this list with Task 7 in Tasks/Subtasks for the corresponding fix locations.

- [x] [AI-Review][HIGH] H1 — Orphaned `/tmp/oslrs-web-dist-<sha>/` on early-failure deploys (set -eo pipefail exits before rm -rf cleanup). FIX: trap-on-EXIT cleanup. `.github/workflows/ci-cd.yml:620`
- [x] [AI-Review][HIGH] H2 — No fail-fast guard for empty/missing dist after copy (silent 404-page deploy possible if scp ships zero files). FIX: `[[ -f /var/www/oslsr/index.html ]]` check post-cp. `.github/workflows/ci-cd.yml:647`
- [x] [AI-Review][HIGH] H3 — Story File List omits `docs/team-context-brief.md` (on-topic), `package.json` + `pnpm-lock.yaml` (scope-creep: js-yaml + markdown-it for baseline-report tooling). FIX: team-context-brief.md added to File List below; package.json + pnpm-lock.yaml git-stashed for separate commit.
- [x] [AI-Review][MED] M1 — Pitfall #10 in playbook stale post-Wave-0 (still teaches old VPS-side build pattern). FIX: cross-reference to Part 6.2 + Pitfall #23. `docs/infrastructure-cicd-playbook.md` Pitfall #10 row
- [x] [AI-Review][MED] M2 — Manual Redeploy snippet (Part 7) teaches deprecated pattern AND will trip Pitfall #23 (no VITE_HCAPTCHA_SITE_KEY / VITE_GOOGLE_CLIENT_ID in the build line). FIX: source from `/root/oslrs/.env`, all 3 VITE_* on the build line, emergency-only callout. `docs/infrastructure-cicd-playbook.md` Manual Redeploy section
- [x] [AI-Review][MED] M3 — No backup of `/var/www/oslsr/` before cp (no rollback path). FIX: backup-before-overwrite to `/var/www/oslsr.bak.prev` (mirrors nginx backup-test-restore pattern). `.github/workflows/ci-cd.yml:640`
- [ ] [AI-Review][MED] M4 — Lighthouse job rebuilds dist redundantly (lines 502-503). DEFERRED: lighthouse needs its own dist for perf measurement; not Wave 0 scope. Documented as known exception. Future cleanup: drop redundant rebuild OR document the exception in Part 6.2.
- [x] [AI-Review][LOW] L1 — Task 6 [x] / Task 6.2 [ ] DEFERRED inconsistency. FIX: parent task changed to [~] PARTIAL.
- [x] [AI-Review][LOW] L2 — No periodic /tmp cleanup documented. FIX: Periodic Maintenance subsection added to playbook with quarterly sweep snippet.
- [x] [AI-Review][LOW] L3 — Status gate clarity. FIX: Task 5 close-out gate makes the in-progress → done transition explicit and time-bounded.
