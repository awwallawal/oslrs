# Port Audit — 2026-05-08

**Story:** 9-9 AC#3 (Public port audit & Portainer hardening).
**Scope:** Production VPS `oslsr-home-app` (DigitalOcean droplet, public IP 159.89.146.93, Tailscale 100.93.100.28).
**Method:** `ss -tlnp` + `iptables -L -n` + `iptables -t nat -L -n` + `docker ps` + `ufw status verbose` over Tailscale SSH; external probe via `Test-NetConnection` from operator laptop public IP for DO Cloud Firewall posture.
**Snapshot timestamp:** 2026-05-08 ~16:00 WAT.

## Listening port table

| Port | Bound to | Process / image | DO firewall (public) | UFW (host) | Verdict |
|---:|---|---|---|---|---|
| 22 | `0.0.0.0` + `::` | `sshd` (pid 118533) | ALLOW (`0.0.0.0/0` + `::/0` + `100.64.0.0/10`) | ALLOW IN 22/tcp | ✅ Expected — key-only auth + fail2ban primary; firewall + UFW are defence-in-depth. ADR-020 V8.2-a1 §"DO Console Access Vector" trade-off matrix. |
| 53 | `127.0.0.53` + `127.0.0.54` | `systemd-resolve` | n/a (loopback) | n/a | ✅ Internal DNS resolver; not externally reachable. |
| 80 | `0.0.0.0` | `nginx` (pid 284010, 62294) | ALLOW (HTTP) | ALLOW IN 80/tcp | ✅ Expected — HTTP redirect to HTTPS. |
| 443 | `0.0.0.0` | `nginx` (pid 284010, 62294) | ALLOW (HTTPS) | ALLOW IN 443/tcp | ✅ Expected — public HTTPS ingress; behind Cloudflare orange-cloud per Story 9-9 AC#10. |
| 3000 | `*` (all interfaces) | `node` (pid 284059, oslsr-api) | DENY (probe `False`) | not in user-input chain (DROP by default policy) | ⚠️ **Defence-in-depth gap (FIXED this PR)** — see F2 below. API now binds to `127.0.0.1` by default via `apps/api/src/index.ts:HOST` env. |
| 5432 | `127.0.0.1` | `docker-proxy` → `oslsr-postgres` (172.17.0.4:5432) | DENY (loopback only at host level) | n/a | ✅ Localhost-only per Phase 2 hardening 2026-04-04. iptables nat DOCKER chain DNAT explicitly `0.0.0.0/0 → 127.0.0.1 dpt:5432 → 172.17.0.4:5432` — destination-locked. |
| 6379 | `127.0.0.1` | `docker-proxy` → `oslsr-redis` (172.17.0.3:6379) | DENY (loopback only) | n/a | ✅ Localhost-only per Phase 2 hardening. Same DNAT pattern as Postgres. |
| 8000 | `0.0.0.0` + `::` | `docker-proxy` → `portainer` (172.17.0.2:8000) | **DENY** (probe `False`) | not explicitly allowed | ⚠️ **Defence-in-depth gap** — see F1 below. DO Cloud Firewall blocks externally, but the kernel + Docker NAT permit any local process to hit it. |
| 9443 | `0.0.0.0` + `::` | `docker-proxy` → `portainer` (172.17.0.2:9443) | **DENY** (probe `False`) | **ALLOW IN 9443/tcp** | ⚠️ **Defence-in-depth gap (worse than 8000 because UFW explicitly permits it)** — see F1 below. |
| 9000 | n/a (container-only) | `portainer` (no host mapping; just `9000/tcp` exposed inside the container) | n/a | n/a | ℹ️ No public reachability. The story expected `0.0.0.0:9000` based on Portainer documentation; actual deployment uses `8000` + `9443` instead. |
| 38429 | `100.93.100.28` | `tailscaled` (pid 797) | n/a (tailnet only) | n/a | ✅ Tailscale node-to-node communication. |
| 40918 | tailnet IPv6 | `tailscaled` (pid 797) | n/a | n/a | ✅ Same as 38429 (IPv6 leg). |

## DO Cloud Firewall posture (external probe from operator laptop public IP)

| Port | TCP reachable from public internet? | DO firewall rule? |
|---:|---|---|
| 22 | yes (key-only — would prompt for publickey) | dual-source `0.0.0.0/0` + `::/0` + `100.64.0.0/10` (per ADR-020 V8.2-a1) |
| 80 | yes | ALLOW (Cloudflare / nginx HTTP redirect) |
| 443 | yes | ALLOW (Cloudflare orange-cloud → nginx HTTPS) |
| 3000 | **no** | (no rule — implicit DENY) |
| 8000 | **no** | (no rule — implicit DENY) |
| 9443 | **no** | (no rule — implicit DENY) |

**Conclusion:** the cloud edge is correctly locked down. Defence-in-depth at the host level still has two gaps (F1 + F2). DO Cloud Firewall is the only thing standing between the public internet and a Portainer admin login if a future operator account compromise rotates the firewall rules. Belt-and-braces means closing the gap at the host level too.

## Findings

### F1 — Portainer publicly bound at kernel + UFW level (mitigation: rebind to 127.0.0.1)

**Symptom:** `docker ps --format "{{.Ports}}"` shows `0.0.0.0:8000->8000/tcp, [::]:8000->8000/tcp, 0.0.0.0:9443->9443/tcp, [::]:9443->9443/tcp` for the `portainer` container. UFW `ufw-user-input` chain explicitly contains `ALLOW 9443/tcp from anywhere`.

**Risk:** if the DO Cloud Firewall is ever misconfigured or rotated by an account compromise, Portainer's admin UI becomes the public attack surface. Portainer holds Docker socket access (volumes mount `/var/run/docker.sock` per `docker inspect portainer`), so an authenticated session is effectively root-on-host.

**Mitigation — Option A (RECOMMENDED): rebind to `127.0.0.1`.** Operator accesses Portainer via SSH tunnel:

```bash
# On laptop (Tailscale):
ssh -L 9443:127.0.0.1:9443 root@oslsr-home-app
# Then browse:
https://localhost:9443
```

**Recreate recipe (operator action — requires brief Portainer downtime):**

```bash
ssh root@oslsr-home-app
# Capture for rollback
docker inspect portainer > /root/portainer-config-backup-2026-05-08.json
# Recreate with localhost-only binding
docker stop portainer
docker rm portainer
docker run -d \
  --name=portainer \
  --restart=always \
  -p 127.0.0.1:8000:8000 \
  -p 127.0.0.1:9443:9443 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v portainer_data:/data \
  portainer/portainer-ce:latest
# Cleanup the now-stale UFW rule
ufw delete allow 9443/tcp
```

**Verification:**

```bash
# Should now show 127.0.0.1:8000 / 127.0.0.1:9443 instead of 0.0.0.0
docker ps --format "{{.Names}}\t{{.Ports}}"
# Should fail (exit 1, "Connection refused")
ssh root@oslsr-home-app "curl -k --max-time 3 https://0.0.0.0:9443/" 
# Should succeed via SSH tunnel
ssh -L 9443:127.0.0.1:9443 root@oslsr-home-app -fN; curl -k https://localhost:9443/; ssh -O exit root@oslsr-home-app
```

**Volume preservation:** the `portainer_data` named volume holds the Portainer config DB (admin password, endpoints, settings). The recreate above mounts the same volume, so admin login + endpoint config carry over. Verify by logging in with the existing admin credentials post-recreate.

**Rollback (if Portainer admin login fails post-recreate):**

```bash
docker stop portainer && docker rm portainer
docker run -d \
  --name=portainer \
  --restart=always \
  -p 8000:8000 \
  -p 9443:9443 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v portainer_data:/data \
  portainer/portainer-ce:latest
```

**Mitigation — Option B (NOT RECOMMENDED): keep public, add nginx basic-auth proxy in front.** Adds complexity, weaker than Option A (basic-auth credentials are still rotatable but a brute-force surface). Only worth doing if the operator strictly requires Portainer access without SSH.

### F2 — API process bound to `*:3000` (FIXED this PR; severity bumped LOW → MEDIUM 2026-05-08 third-pass review)

**Symptom:** `ss -tlnp` showed `LISTEN 0 511 *:3000 ... users:(("node",pid=284059,fd=48))`. The API process bound to all interfaces because `apps/api/src/index.ts:35` called `server.listen(port, callback)` with no host argument — Node's default for missing host is `::` (which on dual-stack maps to `0.0.0.0` too).

**Risk:** any process on the host (or any container started with `--network=host`) could bypass nginx and hit the API directly, sidestepping rate limiting + TLS termination + the Cloudflare-WAF chain. Containers on the default `bridge` network (`oslsr-postgres`, `oslsr-redis`, `portainer`) are not reachable to the host's API via `localhost:3000` from inside the container — `localhost` resolves to the container's own loopback — so the gap is narrower than "any container", but the host-process and `--network=host` paths are real. Severity is MEDIUM (not LOW): the API ingress is the public-facing surface motivating the wider audit, and defence-in-depth on it is not hygiene-only.

**Fix shipped in this PR:**
- `apps/api/src/lib/listen-address.ts` — new pure-function helper `resolveListenAddress(env)` returning `{host, port}` with `HOST` defaulting to `127.0.0.1` and `PORT` defaulting to 3000. Unit-tested in `apps/api/src/lib/__tests__/listen-address.test.ts` (8 cases covering unset/empty/override/non-numeric).
- `apps/api/src/index.ts` — imports the helper and calls `server.listen(port, host, …)`.
- `.env.example` — documents the `HOST=127.0.0.1` default and the override condition.
- `infra/nginx/oslsr.conf` — both `proxy_pass` directives switched from `http://localhost:3000` to `http://127.0.0.1:3000` so the upstream host is explicit and matches the IPv4-only API bind. Avoids the brittle dependency on `/etc/hosts` resolution order.

**IPv4 / IPv6 dependency:** binding to `127.0.0.1` makes the API IPv4-only. The previous default (`::` dual-stack) accepted both. With nginx now hitting `http://127.0.0.1:3000` explicitly (not `localhost`), the dependency on `/etc/hosts` resolution order is removed. If a future operator switches nginx upstream to `[::1]:3000`, the API will become unreachable until either (a) HOST is set to `::1` or `::`, or (b) nginx is reverted. The `Pre-deploy verification` step below catches this.

**Pre-deploy verification (must run before relying on AC#3 closure):**
```bash
ssh root@oslsr-home-app
ss -tlnp | grep 3000   # expect: 127.0.0.1:3000  (not *:3000)
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/v1/health   # expect: 200
curl -sS -o /dev/null -w "%{http_code}\n" https://oyotradeministry.com.ng/api/v1/health   # expect: 200 (full nginx → CF → public chain)
```

### F3 — Stale UFW rule for 9443 (resolved by Option A above)

**Symptom:** `ufw status verbose` shows `9443/tcp ALLOW IN Anywhere`. Once Portainer rebinds to `127.0.0.1` (F1 fix), this UFW rule is no longer doing anything productive — it permits a port that no longer accepts public traffic at the kernel level. Stale rules drift toward "we'll re-narrow later" state and accumulate.

**Resolution:** the `ufw delete allow 9443/tcp` step in the F1 recipe removes the stale rule.

### F4 — UFW + DO Cloud Firewall scope mismatch (informational, not actionable)

**Symptom:** UFW allows 22/80/443/9443 in `ufw-user-input`. DO Cloud Firewall (cloud edge) allows 22/80/443 — does NOT have a 9443 rule. They're consistent on 22/80/443 (correct posture for public HTTP/HTTPS + SSH); they diverge on 9443 only because UFW carries a stale rule (F3).

**Verdict:** no action — UFW and DO firewall serve different layers of defence-in-depth. DO firewall is the public ingress gate; UFW is the host-level gate after DO firewall lets a packet through. The two-gate architecture is by design.

## Postgres + Redis verification (✅ no action needed)

Per Phase 2 hardening 2026-04-04, both Postgres + Redis containers were rebound from `0.0.0.0` to `127.0.0.1`. This audit confirms the binding is still correct:

- `docker ps` → `oslsr-postgres   127.0.0.1:5432->5432/tcp` ✅
- `docker ps` → `oslsr-redis      127.0.0.1:6379->6379/tcp` ✅
- `iptables -t nat DOCKER` chain — DNAT for both 5432 and 6379 is destination-locked (`0.0.0.0/0 → 127.0.0.1 dpt:5432`), not destination-permissive (`0.0.0.0/0 → 0.0.0.0/0`). Compare against Portainer's permissive DNAT (`0.0.0.0/0 → 0.0.0.0/0`).

## SSH posture verification (✅ no action needed)

Per ADR-020 V8.2-a1 §"DO Console Access Vector":

- DO Cloud Firewall SSH rule sources: `0.0.0.0/0` + `::/0` + `100.64.0.0/10` (dual-source for DO Console + Tailscale + GH Actions). Confirmed by Test-NetConnection from public IP succeeding (would prompt for publickey).
- sshd (pid 118533) bound to `0.0.0.0` + `::` — expected.
- UFW `ALLOW IN 22/tcp` — consistent with DO firewall.
- Tailscale-only narrowing remains a known follow-up gated on the self-hosted GH Actions runner story (recommend Story 9-14 per Story 9-9 H3 follow-up).

## Audit complete — Summary

| Finding | Severity | Resolution |
|---|---|---|
| F1: Portainer 8000 + 9443 publicly bound | MEDIUM | **Operator action: recreate Portainer container with `127.0.0.1` port mappings** — recipe + rollback in §F1 |
| F2: API process bound to `*:3000` | MEDIUM (bumped from LOW 2026-05-08 third-pass review) | **FIXED in this PR** — `apps/api/src/lib/listen-address.ts` (new) + index.ts + .env.example + nginx upstream `127.0.0.1:3000` (explicit, not `localhost`) |
| F3: Stale UFW rule for 9443 | LOW | Resolved by F1 recipe (`ufw delete allow 9443/tcp` step) |
| F4: UFW vs DO firewall scope mismatch | INFO | No action — consistent two-gate architecture |
| Postgres / Redis localhost-only | ✅ | No action |
| SSH posture matches ADR-020 V8.2-a1 | ✅ | No action |
