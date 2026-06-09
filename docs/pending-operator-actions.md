# Pending Operator Actions — third-party-console & local-only tasks

**Purpose.** A single place for the work that **cannot be done from the repo/CI** — actions that need a human in an external console (Google Cloud, Cloudflare dashboard, DigitalOcean console, the domain registrar, Resend, Termii) or on the operator's own machine. Dev/repo/CI work and VPS changes deployable via CI or Tailscale are **not** listed here. Read this at **BOT transfer** — it's the seam where things silently slip.

_Convention: ✅ done · ⏳ pending · 🔁 recurring. Keep this in lockstep with the security register + roadmap._

---

## ✅ Done (2026-06-09 security session)
- **F-024 origin-lock (console steps):** WhoGoHost apex A de-pointed; DO Cloud Firewall 443 → Cloudflare IP ranges; CF Origin Cert generated + CF SSL Full(strict); Authenticated Origin Pulls enabled. _(register F-024 → Fixed)_
- **Google OAuth retirement (Task 10.2 / 9-12, 9-9 residual):** GCP OAuth client `130306069266-…` **deleted**; GH Actions `VITE_GOOGLE_CLIENT_ID` variable deleted; VPS `.env` `GOOGLE_*` removed + `oyotradeministry` dropped from `CORS_ORIGIN`. _(9-12 → done-superseded)_
- **Origin Cert private key** scrubbed from `ssh_analysis.txt`.

## ⏳ Pending — LAUNCH-GATE / pre-blast (roadmap Phase 2)
- **Resend Pro** account/upgrade — required before the email re-engagement blasts (9-27 / 9-28).
- **Termii** account + sender setup — required before the SMS blast (9-27 Part B).
- **9-30 validation:** confirm 24h of zero new `csp_violation` events + first Cloudflare Web Analytics rows, then flip 9-30 → done.

## ⏳ Pending — ops hygiene (NOT launch-gating)
- **`BACKUP_ENCRYPTION_KEY` — VERIFY, do NOT regenerate.** It is **already set** on the VPS `.env` (a valid 64-hex key). Confirm it is saved in your **password manager + an offline/paper copy**. ⚠️ Regenerating it makes every existing encrypted S3 backup **undecryptable** — only ever rotate with a documented re-encrypt plan. _(9-9 AC#5)_
- **Run the §7.2 restore drill once** for first-pass evidence (9-9 AC#5).
- **SSH firewall re-narrow** to `100.64.0.0/10` + DO infra ranges once a self-hosted GH Actions runner is inside the tailnet (Story 9-14 sibling; Operate-phase).

## 🔁 Recurring — calendar/expiry watch (until Story 9-50 automates it)
- **Cloudflare Origin Cert** expires **2041-06-05** — regenerate + reinstall before then.
- **CF origin-pull CA** (AOP) expires **2029-11-01** — re-fetch + reload nginx before then.
- **Domain registrations:** `oyoskills.com` exp **2028-04-26**, `oyotradeministry.com.ng` exp **2027-01-20** — keep auto-renew ON + a valid payment card. A lapse kills web **and** email.
- _Story 9-50 (Expiry Monitoring) will surface all of the above as a Super-Admin dashboard countdown + alert; until it ships, this list is the manual record (also in `docs/infrastructure-cicd-playbook.md` Part 13)._

---
_Created 2026-06-09 as the operator-console close-out of the security session. Source of truth for "what console/local work remains before launch." Cross-refs: `docs/security/findings-register.md`, `docs/roadmap-to-launch.md`, `docs/infrastructure-cicd-playbook.md` Part 13._
