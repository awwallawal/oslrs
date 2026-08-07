# Story 13.52: An open tab must survive a deploy

Status: done

<!-- EMERGENT 2026-08-07 from the 13-4 adjudication session. Shipped as a hotfix (aac6153) BEFORE
this file existed, which is the wrong order and is recorded as such below. Written retrospectively
so the change has acceptance criteria, a test story and a reopen trigger rather than living only in
a commit message. -->

## Story

As **anyone with the app already open — an enumerator mid-interview most of all**,
I want **a release to not break my next click**,
so that **I am not shown "Page Error" with a "Try Again" button that cannot work, at the moment I am
sitting in front of a respondent.**

## Context

Awwal clicked "Staff Portal" in the footer and got *"Page Error — something went wrong on this
page."* A manual refresh fixed it. That combination is the trap: it reads as a glitch.

`ci-cd.yml` publishes by moving the whole docroot aside and laying down a clean one
(`mv /var/www/oslsr /var/www/oslsr.bak.prev`). That is deliberate and good — it buys one-step
rollback. But **every fingerprinted chunk of the previous build disappears the instant a deploy
completes.** A tab still running the old `index.js` requests a chunk hash that no longer exists,
gets a 404, React's dynamic import rejects, and the error boundary shows a generic failure.

**Blast radius scales with exactly the thing we want.** Today it is invisible: few concurrent users,
and anyone affected refreshes without thinking. Once enumerators keep the app open across a working
day, every deploy breaks the next navigation for all of them — mid-form, on a phone, with an error
message that explains nothing and a recovery button that cannot help because the file is gone.

## What shipped (hotfix aac6153, 2026-08-07)

### AC1 — The client recovers itself ✅
1. `apps/web/src/lib/lazy-with-recovery.ts` wraps `React.lazy`; on a chunk-load error it reloads the
   page **once**.
2. Detection matches the three different messages browsers emit (`Failed to fetch dynamically
   imported module` / `error loading dynamically imported module` / `Importing a module script
   failed`, plus `ChunkLoadError`) — **never a single string**, which would silently stop matching
   the day a browser reworded it.
3. Guarded by `sessionStorage`: a second consecutive failure is NOT a stale chunk, so it is allowed
   to surface. **A reload loop is worse than an error page** — the user cannot even read it long
   enough to report anything.
4. The flag is cleared on the next success, so a LATER deploy in the same session also recovers.
5. Aliased as `lazy` in `App.tsx`, so all **99** routes are covered without edit **and a route added
   later cannot forget it.** Opt-out would have rotted within a sprint.

### AC2 — The server avoids needing the reload at all ✅
1. nginx serves the PREVIOUS build's chunks when the current build lacks the file
   (`try_files $uri @previous_build`, rooted at `/var/www/oslsr.bak.prev`).
2. The directory is already on disk for rollback, so this costs nothing.
3. Superseded chunks get `expires 5m`, never the 1-year immutable of a live asset.

**Both are kept deliberately.** The server fix avoids the reload — which is what matters for an
enumerator mid-form — and the client fix still covers the cases the server cannot: a first deploy
to a fresh host, a restored VPS, or any future CDN in front of nginx.

### ⚠️ AC3 — Two traps caught while writing AC2, recorded because they nearly shipped
1. **`location /assets/` would never have fired.** nginx evaluates REGEX locations before prefix
   ones, and the existing `location ~* \.(js|css|…)$` wins for every `.js` — precisely the files
   the fallback exists to serve. It needs `^~`, which suppresses regex evaluation.
2. **`^~` alone would have stripped CSP and HSTS from every asset**, because `add_header` inside a
   location disables inheritance. A caching fix would have quietly become a security regression.
   The full 9-header set is repeated in both blocks and was verified at parity.

## ⬜ Remaining — what the hotfix did NOT do

1. **No automated test covers either half.** The client path needs a unit test that a rejected
   dynamic import triggers exactly one reload and that a second failure throws; the nginx path needs
   a post-deploy assertion (`curl` an asset from the previous build, expect `200` +
   `X-Served-From: previous-build`). **Shipped-untested is why this is `done` but carries an open
   item, not because the fix is doubted.**
2. **`.bak.prev` holds exactly ONE generation.** Two deploys inside a tab's lifetime and the
   fallback misses; the client reload catches it, but the seamless path is gone. Consider keeping
   two, or pruning by age rather than by count.
3. **Nothing alerts if the fallback starts serving heavily.** Sustained `X-Served-From:
   previous-build` means many clients are on stale code — useful signal, currently invisible.
   Natural fit for the ops digest (13-42).

## Process note — the order was wrong, deliberately and not ideally

This was hotfixed before the story existed, during an adjudication session, because the enumerator
smoke was blocked behind a deploy and the defect was in the deploy path itself. That is a legitimate
call for a live-blocking defect, but it inverts the BMAD order, and writing the story afterwards
cannot recreate the acceptance criteria a story would have forced UP FRONT — most obviously the
tests in the Remaining section above, which a written AC would have demanded before the code landed
rather than after.

**REOPEN TRIGGER:** any "Page Error" reported immediately after a deploy, or an
`X-Served-From: previous-build` rate that stays high once traffic grows.
