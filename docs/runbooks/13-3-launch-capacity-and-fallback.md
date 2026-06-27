# Runbook — Launch Capacity Load Test + Static Fallback (Story 13-3)

🚦 **Pre-spend gate item #4** — both halves GREEN before paid radio/social. Sibling of Story 9-20.
Cross-linked from `docs/runbooks/pre-launch-operator-runbook.md`.

This story delivers the **load profile + runner**, the **static fallback artifact + lead wiring**, and
this runbook. The **prod load-test run** and the **Cloudflare deploy** are **operator (Awwal, Tailscale)**
actions — the dev work is done; the two operator steps below close the gate.

---

## Part A — Radio-spike load test (AC1)

**Profile (the modelling assumption — confirm against expected reach before running):** `50` concurrent
clients × `60s` (5s warmup) against the registration hot path. Source of truth + thresholds live in
`apps/api/src/lib/load-test-eval.ts` (`LOAD_PROFILE`, `LOAD_TEST_THRESHOLDS`). Tune `--connections` up if
the expected first-minutes reach is higher.

**Gate thresholds (all must pass for GREEN):** p95 < 1500ms · error rate < 1% · throughput ≥ 20 req/s.
Zero completed requests = **RED** (origin unreachable), never a vacuous pass.

### Run it
```bash
# 1) Local smoke (no prod, no data) — proves the runner + verdict:
pnpm --filter @oslsr/api exec tsx scripts/load-test.ts --dry-run
pnpm --filter @oslsr/api exec tsx scripts/load-test.ts            # vs local http://localhost:3000/api/v1/health

# 2) PROD run (OPERATOR, Tailscale). FIRST allow-list the source so cf-traffic-watch (9-52) doesn't page:
#    every request carries `x-load-test: 13-3` + UA `oslsr-load-test/13-3` — allow-list that, OR expect+annotate the alert.
cd /root/oslrs && pnpm --filter @oslsr/api exec tsx scripts/load-test.ts \
  --target https://oyoskills.com --path /api/v1/registration/active-form \
  --connections 50 --duration 60 --i-understand-this-hits-prod
```
- **Target a READ hot path** (e.g. the public active-form GET) — it models the spike's bulk load without
  polluting data. Write-path (draft/submit) testing creates rows + hits rate limits — only if deliberately needed.
- **Read headroom from the EXISTING monitoring** during the run (AC1.3 — no new metrics surface): watch the
  **Operations dashboard** (`getSystemHealth` pm2 CPU/RAM/restart + disk, `getTraffic` funnel) on a second screen.
- **Capture** the printed numbers + VERDICT into Part C.

## Part B — Static fallback (AC2) — deploy + verify

Full deploy/cutover/drain/DPIA steps: **`cloudflare-fallback/README.md`**. Summary:
1. `wrangler kv namespace create LEADS_KV` → bind as `LEADS_KV` on the Pages project.
2. `wrangler pages deploy cloudflare-fallback --project-name oslsr-fallback`.
3. **Cutover** (manual / health-gated DNS or CF Load-Balancer origin-health rule — no auto-failover).
4. **Verify round-trip (AC3.2):** submit a test lead through the deployed page → confirm it lands in KV
   (`wrangler kv key list --binding LEADS_KV`) and the CSV drains into the 13-2 import path. Not asserted from code alone.
5. **DPIA (AC2.5):** record the edge-store PII capture in Appendix H.

## Part C — Gate verdict (AC3) — record before spend

| Half | Evidence | Verdict |
|------|----------|---------|
| Load test (A) | **2026-06-27, on-box vs `localhost:3000/api/v1/forms/public-active` (1-core box).** 50×60s: p95 **346ms** · **0.00%** err · **247 req/s** · no crash (restarts 185→185) · mem ~1.0/1.97GB. | ✅ **GREEN** |
| Fallback (B) | **2026-06-27 — deployed to Cloudflare Pages `oslsr-fallback` (prod URL `https://oslsr-fallback.pages.dev`, 200). KV `7e5702d9`. Round-trip CONFIRMED:** submitted leads land as `lead:<iso>:<email>` (verified via `kv key list … --remote`; e.g. `test_awwal@gmail.com`, 30-day TTL). | ✅ **GREEN** |

**Load-test headroom curve (2026-06-27):** the box is throughput-bound at **~245 req/s** (1 core) and degrades by **latency, not failure** — zero errors at every level:

| Concurrency | p95 | throughput | errors | crash |
|---|---|---|---|---|
| 20 | 185ms | 231 req/s | 0% | no |
| **50 (gate model)** | **346ms** | 247 req/s | **0%** | no |
| 100 | 648ms | 244 req/s | 0% | no |

p95 ≈ doubles per 2× concurrency → the 1500ms ceiling lands near **~200 concurrent**; beyond that it gets slow but does NOT error/crash — which is exactly the **static-fallback cutover** trigger. The box comfortably survives a strong radio spike; the fallback is the insurance for a beyond-capacity surge.

**Gate item #4 = ✅ GREEN (2026-06-27)** — Half A (capacity) + Half B (fallback) both green. Capacity is proven and a captured lead beats a timeout. Record in `docs/runbooks/pre-launch-operator-runbook.md`.

> ⚠️ **Draining gotcha:** wrangler 4.x `kv key` commands default to a LOCAL store — always pass **`--remote`** to see/drain the real captured leads: `npx wrangler kv key list --namespace-id 7e5702d9a06b43499ab75f0b7da39bf5 --remote`.
> **Go-live cutover** (separate, launch-day): point `oyoskills.com`/a `signup.` subdomain at the Pages project (DNS or LB origin-health rule). Until then the fallback lives at `oslsr-fallback.pages.dev`. Test leads in KV (`diagtwo@`, `prodcheck@`, `test_awwal@`) can be deleted or left to expire (30-day TTL).
