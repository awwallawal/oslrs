# Prep Story: Build Off-VPS via Cloud-Runner Artifact Handoff (Wave 0)

Status: ready-for-dev

<!-- Created 2026-04-27 by Awwal+Claude after Phase 3 ship triage. The 2026-04-27 06:32 UTC CRITICAL system-health digest (cpu 100%, memory 91%) was triaged as deploy-driven, not runtime. Root cause: `pnpm install` + `pnpm --filter @oslsr/web build` runs on the 2GB VPS as part of every deploy, consuming 700MB-1GB RAM + 70-90% CPU for 2-3 min. CI's `lint-and-build` job ALREADY builds the same dist on a cloud runner and discards the output. This story stops discarding it. -->

## Story

As the **operator**,
I want **the production web build (vite + tsc) to run on the GitHub-hosted CI runner and ship its `dist/` output to the VPS as a downloaded artifact**,
so that **VPS resource spikes during deploy stop tripping CRITICAL system-health alerts (alert noise → real signal), deploy time drops, and the 2GB VPS is reserved for runtime workload only**.

## Why this is Wave 0 (architectural)

Triage of the 2026-04-27 06:32 UTC CRITICAL alert proved that PM2 ↺ counter inflation is **deploy-driven, not spontaneous**. Every deploy spikes CPU + memory on the 2GB VPS for 2-3 min during `pnpm install` + `pnpm build`. While Story 9-10 AC#2 partial fix (commit `718f84e`) eliminated the ioredis-shutdown-crash component of restart cycle inflation, the deploy-spike root cause is unaddressed. Until this story lands, every deploy will continue to:

- Trip CRITICAL system-health digest emails (false positives that train operator to ignore real signals — alert fatigue)
- Cause API restart with brief unavailability during build step
- Pollute Story 9-10 AC#1 trajectory data with deploy-driven restart entries

This story is **prerequisite to Wave 1** (and especially Story 9-10 AC#3 post-fix observation) — Wave 1 work shouldn't begin in earnest until clean deploy mechanics give clean trajectory data. Effort: ~half-day. Cost: $0 (uses existing GitHub-hosted cloud runner already paid for under repo's free-tier 2,000 min/month allotment).

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

## Prerequisites / Blockers

None. Story 9-7 nginx config is in place; Phase 2/3 architecture is shipped; CI artifact upload pattern is already used by 4 test jobs in the workflow (so the mechanism is proven, just not yet wired to deploy).

## Dependencies (downstream)

- **Story 9-10 AC#3 post-fix observation window** benefits from this landing first. The 7-day post-2026-04-25 trajectory data the 2026-05-04 follow-up checklist will analyze gets cleaner if deploys stop registering as restart events that look like "spontaneous" symptoms.
- **Story 9-9 SSH firewall re-narrow follow-up** doesn't strictly require this but pairs naturally — once we move to a self-hosted runner inside tailnet (separate future story), that runner can do BOTH the build AND the deploy, and we can re-narrow the SSH firewall to `100.64.0.0/10` + DO infrastructure ranges.

## Tasks / Subtasks

### Task 1 — Wire artifact download in deploy job (AC#1)

1.1. Read current `.github/workflows/ci-cd.yml` deploy job (lines 548 onward).
1.2. Add new step BEFORE the existing "Pre-deploy env var safety check":
   ```yaml
   - name: Download build artifacts
     uses: actions/download-artifact@v4
     with:
       name: build-artifacts
       path: ./build-artifacts/
   ```
1.3. The artifact already includes `apps/*/dist` per the existing `lint-and-build` upload step (line 60-70). After download, `./build-artifacts/apps/web/dist/` exists locally on the runner.

### Task 2 — Ship web dist to VPS via scp-action (AC#2)

2.1. Add new step BETWEEN "Download build artifacts" and "Pre-deploy env var safety check":
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
2.2. `strip_components: 4` strips `build-artifacts/apps/web/dist/` from the path so files land directly in `/tmp/oslrs-web-dist-${{ github.sha }}/index.html`, `/assets/`, etc. (rather than nested under the original path structure).
2.3. `appleboy/scp-action@v0.1.7` is the canonical action for runner→VPS file transfer; tested + maintained alongside the ssh-action we already use. SSH key reused.

### Task 3 — Remove VPS-side build, replace with cp from temp dir (AC#3, AC#5)

3.1. Modify the "Deploy to DigitalOcean VPS" ssh-action `script:` block:
   - **REMOVE** lines 595-599 (the `VITE_API_URL=/api/v1 pnpm --filter @oslsr/web build` block + its preceding comment).
   - **MODIFY** line 601-602: change `sudo cp -r apps/web/dist/* /var/www/oslsr/` to:
     ```bash
     # Frontend dist comes from CI artifact (Wave 0 prep — built on cloud runner, not VPS)
     sudo cp -r /tmp/oslrs-web-dist-${{ github.sha }}/* /var/www/oslsr/
     sudo rm -rf /tmp/oslrs-web-dist-${{ github.sha }}
     ```
3.2. **PRESERVE** all other steps in the script: `git pull origin main`, `pnpm install --frozen-lockfile`, `pnpm --filter @oslsr/api db:push`, `pnpm tsx scripts/migrate-audit-immutable.ts`, nginx backup-copy-test-reload, `pm2 restart oslsr-api`.

### Task 4 — Local pre-flight test BEFORE pushing CI change (AC#6 verification)

4.1. On laptop: build locally — `cd apps/web && VITE_API_URL=/api/v1 pnpm build` to produce a fresh `dist/`.
4.2. SCP to a temp dir on the VPS manually:
   ```bash
   scp -r apps/web/dist/* root@oslsr-home-app:/tmp/oslrs-manual-test-dist/
   ```
4.3. SSH to VPS, run a manual deploy script that mimics the new behavior:
   ```bash
   ssh root@oslsr-home-app "
     sudo cp -r /tmp/oslrs-manual-test-dist/* /var/www/oslsr/ && \
     sudo rm -rf /tmp/oslrs-manual-test-dist && \
     pm2 restart oslsr-api
   "
   ```
4.4. Verify all 4 domains return 200 + `/api/v1/health` JSON. If yes, the architecture works — proceed to push the CI change.

### Task 5 — Push, observe, measure (AC#7, AC#8, AC#9, AC#10)

5.1. Commit the workflow changes. Push.
5.2. While CI runs, SSH to VPS in another window and tail PM2 + run `top -bn1 | head -10` every 30 seconds during the deploy step. Capture:
   - Peak `%Cpu(s)` user+sys during deploy
   - Peak `MiB Mem :  used` during deploy
   - Wall-clock from `pm2 restart` log entry to next process pid steady state
5.3. Verify post-deploy: all 4 domains 200, browser test (login + WS), no fresh CSP violations, no crashes in PM2 err log.
5.4. Repeat for 2 more deploys (could be follow-up doc commits if no functional changes pending). Average the metrics. Report.

### Task 6 — Documentation (AC#11)

6.1. Update `docs/infrastructure-cicd-playbook.md`:
   - **Part 6** gains a new "6.2: Build Off-VPS Artifact Handoff" subsection. Describes the upload-artifact in lint-and-build → download-artifact in deploy → scp-action to VPS → cp to /var/www/oslsr/ flow. Includes a "before vs after" text diagram.
   - **Pitfall #22 added:** "VPS-side build on small droplets causes alert noise" — symptom (CRITICAL alerts during deploy windows), cause (build consumes ~70-90% CPU + 700MB-1GB RAM on a 2GB VPS), fix (ship dist as artifact from cloud runner).
6.2. Update `docs/a6-dev-story-sequence.md` to mark Wave 0 as DONE once this story merges.
6.3. Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: flip `prep-build-off-vps-cloud-runner` from `ready-for-dev` → `in-progress` at PR open, → `review` at code review, → `done` at merge.

## Dev Notes

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
| Artifact download misses files | Low | Empty `/var/www/oslsr/` post-deploy → 404 page | Add `ls` check after `cp` step; fail-fast if `index.html` missing |
| `github.sha` interpolation in scp-action target broken | Low | Multi-deploy collision | Verify in pre-flight (Task 4); commit SHA is GA-supported in this action |
| VPS-side `pnpm install` still spikes resources | Medium | Smaller spike still tripping alerts | Acceptable for Wave 0 (40% of pre-fix peak; alerts should not fire). If they do, defer further work to Option (b) above. |

### Test strategy

- **Smoke test:** Pre-flight Task 4 covers the architecture viability (manual scp + manual cp → 200 responses).
- **CI smoke test:** First push after the change runs the new flow end-to-end; AC#6 verification covers regression-free behavior.
- **Resource measurement:** Tasks 5.2-5.4 capture before/after metrics. Bundle into Dev Agent Record → Completion Notes table.
- **No new automated tests required.** No new code paths in apps/api or apps/web.

## File List (estimated)

- `.github/workflows/ci-cd.yml` — modified (deploy job: 2 new steps + 1 modified script block)
- `docs/infrastructure-cicd-playbook.md` — modified (Part 6 new subsection + Pitfall #22)
- `docs/a6-dev-story-sequence.md` — modified (Wave 0 marked done)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — modified (status flip + dated update entry)
- No code changes in `apps/api/src` or `apps/web/src`

## References

- Originating evidence: `docs/session-2026-04-21-25.md` Postscript 3, Story 9-10 file evidence-injection block (commit `718f84e`)
- 2026-04-27 06:32 UTC CRITICAL alert that triggered this analysis
- `.github/workflows/ci-cd.yml` lines 60-70 (existing artifact upload), 548-end (deploy job to modify)
- `appleboy/scp-action` v0.1.7 docs: https://github.com/appleboy/scp-action

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### Change Log

### File List
