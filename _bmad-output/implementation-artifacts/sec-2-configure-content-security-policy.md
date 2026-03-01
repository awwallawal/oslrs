# Story sec.2: Configure Content Security Policy

Status: ready-for-dev

<!-- Source: security-audit-report-2026-03-01.md — SEC-2 (P1 HIGH) -->
<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a security engineer,
I want to configure Helmet with a strict Content-Security-Policy,
so that the application meets NFR8.4 (Anti-XSS) and NFR4.4 (Defense-in-Depth) requirements.

## Acceptance Criteria

1. **AC1:** `app.ts` configures `helmet()` with a comprehensive custom CSP covering all external resources the application loads (see Dev Notes for full directive inventory).

2. **AC2:** CSP is set in `Content-Security-Policy-Report-Only` mode initially. A `POST /api/v1/csp-report` endpoint logs violations to pino logger (JSON format, no DB write needed).

3. **AC3:** The inline `onload` event handler on the Google Fonts `<link>` in `apps/web/index.html` (line 44) is refactored to eliminate the need for `'unsafe-inline'` in `script-src`. Replace with a standard `<link rel="stylesheet">` or move JetBrains Mono import to the existing `fonts.css` file.

4. **AC4:** `style-src` includes `'unsafe-inline'` — this is a documented, accepted tradeoff required by: shadcn/ui (Radix `react-style-singleton`), Recharts SVG inline styles, Sonner toast positioning, Google Identity Services SDK, hCaptcha widget, and 25+ components with inline `style={}` attributes.

5. **AC5:** Frontend application loads and functions correctly with CSP report-only enabled: login, dashboard, form filling, file upload, live selfie capture, hCaptcha, Google OAuth, WebSocket messaging, map views, exports (blob downloads), and PWA service worker.

6. **AC6:** CSP configuration is environment-aware: development uses `ws://localhost:*` for WebSocket and omits `upgrade-insecure-requests`; production uses `wss://oyotradeministry.com.ng`.

7. **AC7:** Tests verify the `Content-Security-Policy-Report-Only` header is present in API responses and contains expected directives.

8. **AC8:** NGINX CSP configuration is documented in `docs/infrastructure-cicd-playbook.md` for production deployment (NGINX serves SPA static files directly — Helmet CSP only covers API JSON responses).

9. **AC9:** All existing tests pass with zero regressions.

## Tasks / Subtasks

- [ ] **Task 1: Refactor `index.html` inline `onload` handler** (AC: #3)
  - [ ] 1.1 Open `apps/web/index.html` — line 44 has: `<link rel="preload" ... onload="this.onload=null;this.rel='stylesheet'">`
  - [ ] 1.2 Replace with standard `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap">` — JetBrains Mono is only used for monospace text, minor render-blocking is acceptable
  - [ ] 1.3 Remove the `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` if no longer needed (the stylesheet link handles connection setup)
  - [ ] 1.4 Keep the `<link rel="preconnect" href="https://fonts.googleapis.com">` for faster DNS resolution
  - [ ] 1.5 Verify fonts load correctly in dev mode

- [ ] **Task 2: Create CSP violation reporting endpoint** (AC: #2)
  - [ ] 2.1 Create `apps/api/src/routes/csp.routes.ts` with `POST /csp-report`
  - [ ] 2.2 Endpoint accepts `Content-Type: application/csp-report` (legacy) and `application/reports+json` (Reporting API)
  - [ ] 2.3 Parse the violation report and log to pino at `warn` level with structured fields: `documentUri`, `violatedDirective`, `blockedUri`, `sourceFile`, `lineNumber`
  - [ ] 2.4 No authentication required on this endpoint (browser sends reports automatically)
  - [ ] 2.5 Rate-limit the endpoint: 10 reports/minute/IP to prevent abuse
  - [ ] 2.6 Register route in `app.ts` BEFORE helmet middleware (so the report endpoint itself isn't blocked)
  - [ ] 2.7 Write 3-4 unit tests: valid report parsed, rate limit enforced, malformed body handled

- [ ] **Task 3: Configure Helmet CSP in `app.ts`** (AC: #1, #2, #4, #6)
  - [ ] 3.1 Replace `app.use(helmet())` with configured `helmet({ contentSecurityPolicy: { ... } })` (see complete directive map in Dev Notes)
  - [ ] 3.2 Set `reportOnly: true` for initial deployment
  - [ ] 3.3 Make WebSocket connect-src environment-aware: `ws://localhost:*` in dev, `wss://oyotradeministry.com.ng` in production (use `process.env.NODE_ENV` and `process.env.CORS_ORIGIN`)
  - [ ] 3.4 Conditionally disable `upgrade-insecure-requests` in development (Safari upgrades localhost to HTTPS, breaking dev)
  - [ ] 3.5 Include both `report-uri` and `report-to` directives pointing to `/api/v1/csp-report`
  - [ ] 3.6 Set `Reporting-Endpoints` header for the newer Reporting API

- [ ] **Task 4: Document NGINX CSP configuration** (AC: #8)
  - [ ] 4.1 Add a "Content Security Policy" section to `docs/infrastructure-cicd-playbook.md`
  - [ ] 4.2 Document the full NGINX `add_header Content-Security-Policy-Report-Only` directive matching the Helmet config
  - [ ] 4.3 Note that NGINX CSP covers the SPA HTML page (which Helmet does not — Helmet only covers Express-served API responses)
  - [ ] 4.4 Document the switch from report-only to enforcing after validation period
  - [ ] 4.5 Note the architecture discrepancy: line 657 says "no unsafe-inline" but line 1984 NGINX spec includes it — resolved by accepting unsafe-inline for style-src only, with justification

- [ ] **Task 5: Verify all features work with CSP report-only** (AC: #5)
  - [ ] 5.1 Start the dev server and check browser console for CSP violation reports
  - [ ] 5.2 Test: Login (email + password) — no violations
  - [ ] 5.3 Test: Google OAuth login — GSI SDK loads in iframe, no violations
  - [ ] 5.4 Test: hCaptcha widget — renders and validates, no violations
  - [ ] 5.5 Test: Dashboard with charts (Recharts) — SVG renders, no violations
  - [ ] 5.6 Test: Map views (Leaflet + OpenStreetMap tiles) — tiles load, no violations
  - [ ] 5.7 Test: Live selfie capture (webcam + @vladmandic/human ML model from jsdelivr CDN)
  - [ ] 5.8 Test: File upload (photo, receipt) — no violations
  - [ ] 5.9 Test: File download/export (blob: URL) — PDF/CSV downloads work
  - [ ] 5.10 Test: WebSocket messaging (Socket.io) — connects and receives messages
  - [ ] 5.11 Test: Service worker registration (PWA)
  - [ ] 5.12 Test: S3 presigned URL images (staff photos from DigitalOcean Spaces)
  - [ ] 5.13 Check the CSP report endpoint for any logged violations — investigate and fix

- [ ] **Task 6: Write tests for CSP header** (AC: #7)
  - [ ] 6.1 Add integration test in `apps/api/src/__tests__/csp.test.ts`
  - [ ] 6.2 Test: API responses include `Content-Security-Policy-Report-Only` header
  - [ ] 6.3 Test: CSP header contains `default-src 'self'`
  - [ ] 6.4 Test: CSP header contains `script-src` with hCaptcha and Google domains
  - [ ] 6.5 Test: CSP header contains `object-src 'none'`
  - [ ] 6.6 Test: CSP report endpoint accepts and logs violation reports

- [ ] **Task 7: Full regression test** (AC: #9)
  - [ ] 7.1 Run `pnpm test` from project root — all tests must pass
  - [ ] 7.2 Run `pnpm build` to verify TypeScript compilation succeeds

## Dev Notes

### Priority & Context
- **P1 HIGH** — Required for NFR8.4 compliance (Anti-XSS: Strict CSP)
- **Blocks:** Epic 7 (Public Skills Marketplace) — public-facing routes are the highest XSS risk surface
- **Depends on:** SEC-1 (dependency CVEs should be resolved first, but not a hard blocker)
- **Source:** [security-audit-report-2026-03-01.md](_bmad-output/planning-artifacts/security-audit-report-2026-03-01.md) Section 2.5 + Story SEC-2

### Architecture References
- **architecture.md line 657:** `CSP: strict-dynamic, no unsafe-inline` — aspirational spec
- **architecture.md line 1984:** NGINX config uses `'unsafe-inline'` — reality of third-party dependencies
- **Resolution:** `style-src 'unsafe-inline'` is accepted (shadcn/Radix/Recharts make it unavoidable). `script-src` avoids `unsafe-inline` by refactoring the onload handler.
- **ADR-006:** Defense-in-Depth — CSP is Layer 1 (Edge) protection alongside rate limiting

### Current State
- `app.ts:71` calls `helmet()` with **zero configuration** — uses only Helmet defaults
- **No `Content-Security-Policy` header** is set on the SPA (NGINX serves static files without CSP)
- Helmet's default CSP (`default-src 'self'`, `script-src 'self'`, etc.) would break the app if enforced — Google OAuth, hCaptcha, maps, fonts, S3 images, WebSocket would all fail
- The `index.html` line 44 has an `onload="this.onload=null;this.rel='stylesheet'"` inline event handler — this requires `'unsafe-inline'` in `script-src` unless refactored

### Complete External Resource Inventory

All external domains the application loads resources from at runtime:

| Resource | Domain(s) | CSP Directive | Source Files |
|----------|-----------|---------------|--------------|
| Google Identity Services SDK | `accounts.google.com` | script-src, frame-src, connect-src | `GoogleOAuthWrapper.tsx`, `LoginForm.tsx`, `RegistrationForm.tsx` |
| hCaptcha widget | `hcaptcha.com`, `*.hcaptcha.com` | script-src, frame-src, style-src, connect-src | `HCaptcha.tsx`, `LoginForm.tsx`, `RegistrationForm.tsx`, `ForgotPasswordPage.tsx` |
| Google Fonts (JetBrains Mono) | `fonts.googleapis.com`, `fonts.gstatic.com` | style-src, font-src | `index.html` lines 42-45 |
| OpenStreetMap tiles | `*.tile.openstreetmap.org` | img-src | `TeamGpsMap.tsx`, `GpsClusterMap.tsx`, `ClusterDetailView.tsx` |
| ML face detection models | `cdn.jsdelivr.net` | connect-src | `LiveSelfieCapture.tsx:29`, `sw.ts:52` |
| S3 photos (DigitalOcean Spaces) | `*.digitaloceanspaces.com` | img-src | `VerificationPage.tsx:88`, `ProfileCard.tsx:41` |
| WebSocket (Socket.io) | `wss://oyotradeministry.com.ng` | connect-src | `useRealtimeConnection.ts` |
| Webcam capture | (local) | media-src: `mediastream:` | `LiveSelfieCapture.tsx` |
| Blob downloads (exports) | (local) | img-src, connect-src: `blob:` | `useExport.ts`, `useProductivity.ts`, `IDCardDownload.tsx` |
| Base64 selfie preview | (local) | img-src: `data:` | `SelfieStep.tsx:259`, `LiveSelfieCapture.tsx:85` |
| Service worker | (local) | worker-src: `'self'` | `sw.ts`, `useServiceWorker.ts` |
| Self-hosted fonts (Inter, Poppins) | (local) | font-src: `'self'` | `public/fonts/fonts.css` |

### Complete CSP Directive Map

```javascript
// apps/api/src/app.ts — replace helmet() with:
const isProduction = process.env.NODE_ENV === 'production';
const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
// Extract host for wss:// from CORS_ORIGIN (e.g., "https://oyotradeministry.com.ng" → "wss://oyotradeministry.com.ng")
const wsUrl = isProduction
  ? corsOrigin.replace(/^https?:\/\//, 'wss://')
  : 'ws://localhost:3000';

app.use(helmet({
  contentSecurityPolicy: {
    reportOnly: true, // START in report-only mode — switch to false after validation
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "https://accounts.google.com",   // Google Identity Services SDK
        "https://hcaptcha.com",           // hCaptcha loader
        "https://*.hcaptcha.com",         // hCaptcha assets (wildcard per official docs)
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",               // ACCEPTED TRADEOFF — see AC4 justification
        "https://fonts.googleapis.com",   // Google Fonts CSS
        "https://hcaptcha.com",           // hCaptcha styles
        "https://*.hcaptcha.com",
      ],
      imgSrc: [
        "'self'",
        "data:",                          // Base64 selfies, QR codes
        "blob:",                          // File downloads, ID card generation
        "https://*.tile.openstreetmap.org",  // Leaflet map tiles
        "https://*.digitaloceanspaces.com",  // S3 presigned URLs (photos)
      ],
      fontSrc: [
        "'self'",                         // Inter, Poppins (self-hosted woff2)
        "https://fonts.gstatic.com",      // JetBrains Mono (Google Fonts)
      ],
      connectSrc: [
        "'self'",                         // API calls
        wsUrl,                            // Socket.io WebSocket ('self' does NOT cover wss: in Safari)
        "https://accounts.google.com",    // Google OAuth token exchange
        "https://hcaptcha.com",           // hCaptcha verification
        "https://*.hcaptcha.com",
        "https://cdn.jsdelivr.net",       // @vladmandic/human ML models
        // Note: fonts.googleapis.com NOT needed here — font CSS covered by style-src, font files by font-src
      ],
      frameSrc: [
        "https://accounts.google.com",    // Google OAuth iframe
        "https://hcaptcha.com",           // hCaptcha widget iframe
        "https://*.hcaptcha.com",
      ],
      workerSrc: [
        "'self'",                         // PWA service worker (sw.js)
        "blob:",                          // Potential inline workers (@vladmandic/human)
      ],
      mediaSrc: [
        "'self'",
        "blob:",                          // MediaRecorder output
        "mediastream:",                   // getUserMedia webcam (LiveSelfieCapture)
      ],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      reportUri: ["/api/v1/csp-report"],       // Legacy — still needed for Safari/older browsers
      reportTo: "csp-endpoint",                  // Modern Reporting API — requires Reporting-Endpoints header (Task 3.6)
      // Conditionally disable upgrade-insecure-requests in dev (Safari breaks localhost)
      ...(isProduction ? { upgradeInsecureRequests: [] } : {}),
    },
  },
}));
```

### Why NOT `'strict-dynamic'`
The architecture doc (line 657) specifies `strict-dynamic`, but this is impractical for OSLSR because:
- `'strict-dynamic'` requires nonce-based script loading for ALL scripts
- When `'strict-dynamic'` is present, explicit URL allowlists (google, hcaptcha) are **ignored** by the browser
- Google Identity Services SDK and hCaptcha both load scripts from external domains that would need to be trusted via nonce propagation, which neither library supports natively
- The SPA is served by NGINX as a static file — there is no per-request server rendering to inject nonces into `index.html`
- **Recommendation:** Use explicit domain allowlisting instead. This is equally secure for known, trusted domains.

### Why `'unsafe-inline'` for `style-src` is Accepted
Multiple sources make `style-src 'unsafe-inline'` unavoidable without a nonce-based build pipeline:
1. **shadcn/ui → Radix UI → react-remove-scroll → react-style-singleton**: Dynamically injects `<style>` tags for scroll locking in Dialog, AlertDialog, Sheet, Command components
2. **Recharts 3.7.0**: Renders SVG with inline `style` attributes
3. **Sonner**: Injects inline styles for toast positioning/animation
4. **Google Identity Services SDK**: Injects inline styles for the sign-in button
5. **hCaptcha widget**: Injects inline styles for the challenge iframe
6. **25+ application components**: Use `style={{}}` for dynamic widths (progress bars), heights (chat containers), grid layouts
7. **index.html**: Contains a `<style>` block (lines 48-119) with critical CSS for the hero shell
- **Risk assessment:** Inline styles are significantly less dangerous than inline scripts from an XSS perspective. Inline styles cannot execute arbitrary code — the attack surface is limited to CSS-based exfiltration which requires very specific conditions.
- **Future improvement:** Integrate `get-nonce` package with `setNonce()` in React bootstrap to eliminate need for `'unsafe-inline'` in style-src. This is out of scope for this story.

### NGINX CSP Configuration (for production deployment)
The NGINX config should mirror the Helmet directives. Update the `server` block:
```nginx
# Replace existing CSP header (architecture.md line 1984)
add_header Content-Security-Policy-Report-Only "default-src 'self'; script-src 'self' https://accounts.google.com https://hcaptcha.com https://*.hcaptcha.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://hcaptcha.com https://*.hcaptcha.com; img-src 'self' data: blob: https://*.tile.openstreetmap.org https://*.digitaloceanspaces.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' wss://oyotradeministry.com.ng https://accounts.google.com https://hcaptcha.com https://*.hcaptcha.com https://cdn.jsdelivr.net; frame-src https://accounts.google.com https://hcaptcha.com https://*.hcaptcha.com; worker-src 'self' blob:; media-src 'self' blob: mediastream:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; report-uri /api/v1/csp-report; upgrade-insecure-requests;" always;
```

### CSP Report Endpoint Design
```
POST /api/v1/csp-report
Content-Type: application/csp-report | application/reports+json
No authentication required (browser auto-sends)
Rate limit: 10/min/IP
Response: 204 No Content
Action: Log to pino at warn level with structured fields
```

### Enforcement Transition (Out of Scope)
- This story deploys CSP in **report-only** mode only. Switching to enforcement (`reportOnly: false`) is a separate ops task after a 2-week monitoring period with zero violations in the CSP report endpoint logs.
- Enforcement switch is a one-line change in `app.ts` + matching NGINX header rename (`Content-Security-Policy-Report-Only` → `Content-Security-Policy`).

### Previous Story Intelligence (SEC-1)
- SEC-1 adds `pnpm.overrides` section to root `package.json` — Task 3 builds on the same `app.ts` file
- SEC-1 may update `react-router-dom` — no impact on CSP config
- If SEC-1 is done first, the `helmet()` line number in `app.ts` may have shifted — use the content, not the line number
- SEC-1 creates a precedent for the `pnpm.overrides` pattern in package.json

### Git Intelligence (Recent Commits)
- Last 5 commits are all Epic 6 stories (6-4 through 6-6) — remuneration features
- `app.ts` was last significantly modified in Story 6-1 (audit logs) and 6-2 (health monitoring)
- The `helmet()` call has been untouched since initial setup — no surrounding changes to worry about

### Key Files to Modify
| File | Change |
|------|--------|
| `apps/api/src/app.ts` | Configure `helmet({ contentSecurityPolicy: { ... } })` |
| `apps/web/index.html` | Refactor `onload` handler on font preload link |
| `apps/api/src/routes/csp.routes.ts` | NEW — CSP violation report endpoint |
| `docs/infrastructure-cicd-playbook.md` | Add NGINX CSP documentation |

### Key Files NOT to Modify
- Do NOT modify any shadcn/ui components to remove inline styles
- Do NOT add nonce infrastructure (out of scope — future improvement)
- Do NOT switch Vite config to use `html.cspNonce` (requires server-rendered HTML)
- Do NOT modify NGINX config directly (document changes, deploy separately)

### Testing Approach
- Unit tests for CSP report endpoint (mock request/response)
- Integration test for CSP header presence on API responses
- Manual browser testing for CSP violations (check DevTools Console → Issues tab)
- No Playwright tests needed — CSP is a header, not a UI feature

### References

- [Source: _bmad-output/planning-artifacts/security-audit-report-2026-03-01.md — SEC-2 Story Definition, Section 2.5]
- [Source: _bmad-output/planning-artifacts/architecture.md:649-658 — Decision 2.3: API Security Middleware]
- [Source: _bmad-output/planning-artifacts/architecture.md:1978-1984 — NGINX Security Headers]
- [Source: _bmad-output/planning-artifacts/architecture.md:169-190 — ADR-006: Defense-in-Depth]
- [Source: _bmad-output/project-context.md — Technology Stack & Versions]
- [Source: hCaptcha docs — required CSP directives use *.hcaptcha.com wildcard]
- [Source: Helmet.js docs — contentSecurityPolicy reportOnly option, function directive values]
- [Source: Socket.io CSP — 'self' does NOT cover wss: in Safari, must explicitly list]
- [Source: shadcn/ui Issue #4461 — react-style-singleton injects <style> tags, needs unsafe-inline]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
