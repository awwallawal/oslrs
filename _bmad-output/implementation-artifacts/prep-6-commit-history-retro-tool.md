# Story 7.prep-6: Commit History Retro Tool

Status: ready-for-dev

## Story

As a **scrum master running a retrospective**,
I want a script that summarizes git commit history grouped by story with anomaly flags,
so that retrospectives can use commit trails (the journey) alongside story files (the destination) to surface hidden complexity and incidents.

## Problem Statement

Story files capture what was built. Commit history captures how it was built — false starts, CI failures, incident response, fix clusters. The SEC-3 CORS_ORIGIN crash loop (12+ PM2 restarts) is invisible in the story file but fully documented in the commit trail. Currently, retros rely only on story files and manual recall.

Team agreement A10: "Commit history is a retro input — every retrospective pulls the git log, generates anomaly summary, uses alongside story files."

This is a small utility script. Proposed by Awwal from his other project.

## Acceptance Criteria

1. **Given** a date range or epic number, **when** the script runs, **then** it outputs commits grouped by story key (e.g., `6-1`, `SEC-3`, `prep-4`).
2. **Given** grouped commits, **when** analyzed, **then** anomalies are flagged: stories with high commit counts (>5), `fix:` clusters (>2 fixes for same story), CI-related commits (`ci:` prefix), and commits outside normal working patterns.
3. **Given** ungrouped commits (no story key detectable), **when** the script runs, **then** they appear in an "Uncategorized" section for manual review.
4. **Given** the output, **when** read by the retro facilitator, **then** it provides a concise, actionable summary — not a raw git log dump.
5. **Given** the script, **when** run with no arguments, **then** it defaults to the most recent epic (derived from sprint-status.yaml or last tag/branch).
6. **Given** the existing test suite, **when** all tests run, **then** zero regressions.

## Tasks / Subtasks

- [ ] Task 1: Create the retro summary script (AC: #1, #2, #3, #4, #5)
  - [ ] 1.1 Create `scripts/retro-commits.sh` (shell script, no Node.js dependency)
  - [ ] 1.2 Accept arguments: `--from <date>` and `--to <date>` (ISO format), or `--epic <number>` to auto-derive date range from sprint-status comments
  - [ ] 1.3 Run `git log --oneline --format="%h %s" --after=<from> --before=<to>` to get commits
  - [ ] 1.4 Parse commit messages using conventional commit format: `type(scope): message`
  - [ ] 1.5 Group by story key extraction:
    - Match `Story X-Y` or `(X-Y)` in message → story key
    - Match `SEC-N` → security story key
    - Match `prep-N` → prep task key
    - Match scope like `(respondent)`, `(export)` → associate with known stories if possible
    - Fallback: "Uncategorized"
  - [ ] 1.6 Flag anomalies per story group:
    - High commit count: >5 commits for a single story (suggests hidden complexity)
    - Fix cluster: >2 `fix:` commits for same story (suggests rework or discovered issues)
    - CI commits: any `ci:` prefixed commits (suggests pipeline issues)
    - Build fix pattern: `fix(web): resolve TypeScript` or similar (suggests type errors slipped through)
  - [ ] 1.7 Output formatted summary:
    ```
    ## Epic 6 Commit Summary (2026-02-25 to 2026-03-04)

    Total: 30 commits | Stories: 12 | Anomalies: 3

    ### Story Groups
    6-1-immutable-audit-logs: 4 commits (feat, fix, fix, ci)
    6-4-remuneration: 3 commits (feat, fix, fix) ⚠️ fix cluster
    SEC-3-mass-assignment: 2 commits (fix, fix)
    ...

    ### Anomalies
    ⚠️ 6-4: 2 fix commits after initial feat (rework?)
    ⚠️ 6-1: ci commit (deploy pipeline change mid-story)
    ⚠️ 6-6: 3 commits with TypeScript build fixes

    ### Uncategorized
    e42ddc6 fix(web): remove debug RegistryTestPage import
    c77de6a chore: misc fixes, route wiring, docs
    ```
  - [ ] 1.8 Default behavior (no args): read sprint-status.yaml `# updated:` comment to infer most recent epic date range
- [ ] Task 2: Verify and document (AC: #6)
  - [ ] 2.1 Test the script against Epic 6 commit history (known: 23 items, ~30 commits)
  - [ ] 2.2 Add usage docs to script header comment
  - [ ] 2.3 `pnpm test` — all tests pass, zero regressions (script has no effect on app code)

## Dev Notes

### Commit Message Conventions in This Project

Conventional commits format: `type(scope): message`

**Types observed:**
| Type | Meaning | Example |
|------|---------|---------|
| `feat` | New feature/story | `feat(api,web): implement staff remuneration (Story 6-4)` |
| `fix` | Bug fix or correction | `fix(security): harden mass assignment (SEC-3)` |
| `chore` | Maintenance | `chore: misc fixes, route wiring, docs` |
| `docs` | Documentation | `docs: complete prep-5 remuneration spike` |
| `ci` | CI/CD changes | `ci: add audit migration to deploy pipeline` |

**Scopes observed:** `api`, `web`, `api,web`, `security`, `respondent`, `export` — sometimes includes story reference in message body.

### Story Key Detection Heuristics

From the last 30 commits, story keys appear in these patterns:
- Parenthetical: `(Story 6-7)`, `(SEC-4)`, `(Story 6-1)`
- Prefix: `prep-5`, `prep-10`
- Message body: `Story 6-2`, `Story 6-3`
- Scope hint: `fix(security):` → SEC-N stories

The script should try all patterns, with the parenthetical `(Story X-Y)` being the most reliable.

### What Makes This "Anomaly-Driven"

The script is NOT a raw git log reformatter. It specifically surfaces signals that indicate hidden complexity:

1. **High commit count** — A story with 8 commits vs the average 2-3 suggests unexpected complexity
2. **Fix clusters** — Multiple `fix:` commits for the same story suggest rework, discovered bugs, or scope underestimation
3. **CI commits** — Pipeline changes mid-story suggest deployment issues (like the 6-1 migration or SEC-3 crash loop)
4. **Build fix patterns** — TypeScript errors caught post-commit suggest type safety gaps
5. **Uncategorized commits** — Work that doesn't map to a story may indicate unplanned firefighting

### Why Shell Script (Not TypeScript)

- No build step needed — runs immediately on any dev machine or VPS
- No dependency on project being buildable
- `git log` parsing is naturally suited to shell tools (grep, sed, awk)
- Existing scripts in `scripts/` are a mix of `.ts` and `.sh` — either is acceptable, but shell is simpler for this use case

### Project Structure Notes

- Script location: `scripts/retro-commits.sh` (new file)
- Sprint status reference: `_bmad-output/implementation-artifacts/sprint-status.yaml` (for date range inference)
- Existing scripts: `scripts/cleanup-duplicate-roles.ts`, `scripts/migrate-xlsform-to-native.ts`, `scripts/seed-performance-test-data.ts`, `scripts/generate-xlsform.cjs`
- Retro docs: `_bmad-output/implementation-artifacts/epic-*-retro-*.md`

### Anti-Patterns to Avoid

- **Do NOT make this a Node.js/TypeScript tool** — shell script keeps it dependency-free and instantly runnable.
- **Do NOT dump the raw git log** — the value is in grouping and anomaly detection, not volume.
- **Do NOT try to parse commit bodies** — stick to the first line (subject). Body parsing is fragile and rarely needed.
- **Do NOT require internet access** — this runs purely against the local git repo.

### References

- [Source: epic-6-retro-2026-03-04.md#Key Insight 4] — "Commit History as Retro Input"
- [Source: epic-6-retro-2026-03-04.md#Team Agreements A10] — "Commit history is a retro input"
- [Source: epic-6-retro-2026-03-04.md#Process Improvements P2] — "Commit history retro summary tool"
- [Source: epic-6-retro-2026-03-04.md#Prep Tasks prep-6] — Task definition
- [Source: MEMORY.md#Process Patterns] — "Commit history as retro input: Selective, anomaly-driven"

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
