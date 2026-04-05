# Domain Migration Checklist

> **Current domain:** `oyotradeministry.com.ng`
> **Status:** Active, working. Migration is optional — triggered when a new domain is purchased.
>
> After Story 9-5, all application code reads domain from env vars.
> Migration requires **zero code changes** — only config, static files, and ops.

## Pre-requisites

- [ ] New domain purchased (e.g., `oslrs.com`)
- [ ] DNS A record pointed to VPS IP
- [ ] DNS propagated (`dig newdomain.com` returns VPS IP)

## Step 1 — VPS: SSL + NGINX (15 min)

```bash
# Generate SSL cert
sudo certbot certonly --nginx -d newdomain.com -d www.newdomain.com

# Update NGINX config
sudo nano /etc/nginx/sites-available/oslsr.conf
# Change: server_name oyotradeministry.com.ng → server_name newdomain.com www.newdomain.com
# Change: ssl_certificate paths to /etc/letsencrypt/live/newdomain.com/
sudo nginx -t && sudo systemctl reload nginx
```

## Step 2 — VPS: Environment Variables (5 min)

Edit `.env` on VPS. Only 2 vars are required — the rest cascade automatically:

```bash
# REQUIRED — everything else derives from these
PUBLIC_APP_URL=https://newdomain.com
VITE_SITE_DOMAIN=newdomain.com

# OPTIONAL — only set if you need different values than the auto-derived defaults
# SUPPORT_EMAIL=support@newdomain.com        ← auto-derives from VITE_SITE_DOMAIN
# EMAIL_FROM_ADDRESS=noreply@newdomain.com   ← set explicitly for Resend
# SUPER_ADMIN_EMAIL=admin@newdomain.com      ← set explicitly for alerts
# VITE_SUPPORT_EMAIL=support@newdomain.com   ← auto-derives from VITE_SITE_DOMAIN
# VITE_PUBLIC_URL=https://newdomain.com      ← auto-derives from VITE_SITE_DOMAIN
```

**CRITICAL:** Set env vars BEFORE rebuilding (SEC-3 crash loop lesson).

## Step 3 — VPS: Rebuild + Restart (5 min)

```bash
cd /path/to/oslrs
git pull
pnpm install
pnpm --filter @oslsr/web build   # Rebakes VITE_* vars into frontend
pm2 restart oslsr-api
```

## Step 4 — GitHub: CI/CD Variable (1 min)

Go to `github.com/awwallawal/oslrs/settings/variables/actions`

Set repository variable:
- **Name:** `VITE_API_URL`
- **Value:** `https://newdomain.com/api/v1`

## Step 5 — Static Files: sitemap + robots (5 min)

These are the only 3 files that need manual find-replace:

```bash
# In your local repo:
# index.html — 4 meta tags (canonical, og:url, og:image, twitter:image)
sed -i 's/oyotradeministry.com.ng/newdomain.com/g' apps/web/index.html

# sitemap.xml — 26 <loc> entries
sed -i 's/oyotradeministry.com.ng/newdomain.com/g' apps/web/public/sitemap.xml

# robots.txt — 1 sitemap URL
sed -i 's/oyotradeministry.com.ng/newdomain.com/g' apps/web/public/robots.txt

# Commit and push
```

## Step 6 — Resend: Email Domain Verification (30 min)

See `docs/RESEND-SETUP.md` for detailed steps. Summary:

- [ ] Add `newdomain.com` in Resend dashboard
- [ ] Add DNS records from Resend: SPF (TXT), DKIM (3 CNAMEs), MX
- [ ] Add DMARC: TXT on `_dmarc.newdomain.com` → `v=DMARC1; p=quarantine; rua=mailto:admin@newdomain.com`
- [ ] Wait for DNS propagation, click Verify in Resend
- [ ] Generate new API key scoped to `newdomain.com`
- [ ] Update `RESEND_API_KEY` in VPS `.env`
- [ ] Restart API: `pm2 restart oslsr-api`
- [ ] Send test email, verify DKIM/SPF pass in headers

## Step 7 — Optional

- [ ] **301 redirect** from old domain: Add NGINX server block redirecting `oyotradeministry.com.ng` → `newdomain.com`
- [ ] **Human-facing email**: Set up `admin@` and `support@` via Zoho Mail free or Cloudflare Email Routing (see Story 9-4 Task 6)
- [ ] **Update docs**: Ask Claude to find-replace domain in `docs/` and `_bmad-output/` files

## Verify

```bash
curl -I https://newdomain.com                    # Should return 200
curl -I https://newdomain.com/api/v1/health      # Should return 200
# Send a test staff invitation email — verify delivery + correct links
```

## Reference

- Story 9-2: Original domain migration story (code tasks superseded by 9-5, VPS runbook preserved)
- Story 9-4: Email/Resend setup (full DNS checklist + tier decision)
- Story 9-5: Env var centralization (makes this checklist possible)
- `docs/infrastructure-cicd-playbook.md`: VPS architecture and deployment patterns
