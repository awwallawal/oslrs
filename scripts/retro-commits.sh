#!/usr/bin/env bash
# retro-commits.sh — Git commit history summarizer for retrospectives
#
# Groups commits by story key (e.g., 6-1, SEC-3, prep-4) with anomaly flags.
# Designed for anomaly-driven retro analysis — surfaces hidden complexity.
#
# Usage:
#   bash scripts/retro-commits.sh                          # Auto-detect latest done epic
#   bash scripts/retro-commits.sh --epic 6                 # Epic 6 date range
#   bash scripts/retro-commits.sh --epic 2.5               # Epic 2.5 date range
#   bash scripts/retro-commits.sh --from 2026-02-25 --to 2026-03-04  # Custom range
#
# Output: Grouped commits with anomaly flags (fix clusters, high counts, CI commits)
#
# Anomaly thresholds:
#   - High commit count: >5 commits per story
#   - Fix cluster: >2 fix: commits per story
#   - CI commits: any ci: commits (pipeline changes mid-story)
#   - Build fixes: commits mentioning TypeScript/build errors
#
# Source: Team agreement A10 (Epic 6 retro) — "Commit history is a retro input"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SPRINT_STATUS="$PROJECT_ROOT/_bmad-output/implementation-artifacts/sprint-status.yaml"

HIGH_COMMIT_THRESHOLD=5
FIX_CLUSTER_THRESHOLD=2

FROM_DATE=""
TO_DATE=""
EPIC_NUM=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --from) FROM_DATE="$2"; shift 2 ;;
    --to) TO_DATE="$2"; shift 2 ;;
    --epic) EPIC_NUM="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \?//'
      exit 0
      ;;
    *) echo "Unknown option: $1 (use --help for usage)"; exit 1 ;;
  esac
done

# Derive date range from epic number using sprint-status.yaml comments
derive_epic_dates() {
  local epic="$1"

  if [ ! -f "$SPRINT_STATUS" ]; then
    echo "Error: sprint-status.yaml not found at $SPRINT_STATUS" >&2
    exit 1
  fi

  # Use awk to extract dates from the epic section (between epic-N: and next section)
  local dates
  dates=$(awk -v epic="$epic" '
    /^[[:space:]]+epic-/ && $0 ~ "epic-" epic ":" { in_epic=1 }
    in_epic && /^[[:space:]]+(epic-[0-9]|prep-epic-[0-9]|#[[:space:]]+Epic|#[[:space:]]+Prep|#[[:space:]]+Security|#[[:space:]]+Standalone|#[[:space:]]+Context)/ && !($0 ~ "epic-" epic ":") { in_epic=0 }
    in_epic { while (match($0, /[0-9]{4}-[0-9]{2}-[0-9]{2}/)) { print substr($0, RSTART, RLENGTH); $0 = substr($0, RSTART + RLENGTH) } }
  ' "$SPRINT_STATUS" | sort -u)

  if [ -z "$dates" ]; then
    echo "Error: No dates found for epic $epic in sprint-status.yaml" >&2
    exit 1
  fi

  FROM_DATE=$(echo "$dates" | head -1)
  TO_DATE=$(echo "$dates" | tail -1)
}

# Auto-detect: find latest "done" epic, fall back to latest "in-progress"
auto_detect_epic() {
  if [ ! -f "$SPRINT_STATUS" ]; then
    echo "Error: sprint-status.yaml not found. Use --from/--to or --epic instead." >&2
    exit 1
  fi

  local latest_epic
  latest_epic=$(awk '/^[[:space:]]+epic-[0-9][0-9.]*:[[:space:]]+done/ && !/retrospective|prep/ { sub(/^[[:space:]]+epic-/, ""); sub(/:.*/, ""); last=$0 } END { print last }' "$SPRINT_STATUS")

  if [ -z "$latest_epic" ]; then
    latest_epic=$(awk '/^[[:space:]]+epic-[0-9][0-9.]*:[[:space:]]+in-progress/ && !/retrospective|prep/ { sub(/^[[:space:]]+epic-/, ""); sub(/:.*/, ""); last=$0 } END { print last }' "$SPRINT_STATUS")
  fi

  if [ -z "$latest_epic" ]; then
    echo "Error: Could not auto-detect epic from sprint-status.yaml" >&2
    exit 1
  fi

  echo "Auto-detected: Epic $latest_epic" >&2
  EPIC_NUM="$latest_epic"
  derive_epic_dates "$latest_epic"
}

# Resolve date range
if [ -n "$EPIC_NUM" ]; then
  derive_epic_dates "$EPIC_NUM"
elif [ -z "$FROM_DATE" ] && [ -z "$TO_DATE" ]; then
  auto_detect_epic
elif [ -z "$FROM_DATE" ] || [ -z "$TO_DATE" ]; then
  echo "Error: Both --from and --to are required when using date range" >&2
  exit 1
fi

# Fetch commits (--before is exclusive, add T23:59:59 to include TO_DATE)
COMMITS=$(cd "$PROJECT_ROOT" && git log --oneline --format="%h %s" --after="$FROM_DATE" --before="${TO_DATE}T23:59:59" --reverse 2>/dev/null || true)

if [ -z "$COMMITS" ]; then
  echo "No commits found in range $FROM_DATE to $TO_DATE"
  exit 0
fi

# Single awk pass: extract story keys, group commits, detect anomalies, output everything
echo "$COMMITS" | awk -v high_thresh="$HIGH_COMMIT_THRESHOLD" -v fix_thresh="$FIX_CLUSTER_THRESHOLD" \
  -v epic_num="$EPIC_NUM" -v from_date="$FROM_DATE" -v to_date="$TO_DATE" '
function extract_key(msg,   k) {
  # Pattern 1: (Story X-Y) or (Story X.Y) or (Story X.Y-Z)
  if (match(msg, /\(Story [0-9]+[.-][0-9]+[a-z]?(-[0-9]+[a-z]?)?\)/)) {
    k = substr(msg, RSTART+7, RLENGTH-8)
    return k
  }
  # Pattern 2: (SEC-N)
  if (match(msg, /\(SEC-[0-9]+\)/)) {
    k = substr(msg, RSTART+1, RLENGTH-2)
    return k
  }
  # Pattern 3: (prep-N)
  if (match(msg, /\(prep-[0-9]+\)/)) {
    k = substr(msg, RSTART+1, RLENGTH-2)
    return k
  }
  # Pattern 4: (ci-fix) (perf-N)
  if (match(msg, /\(ci-fix\)/)) return "ci-fix"
  if (match(msg, /\(perf-[0-9]+\)/)) {
    k = substr(msg, RSTART+1, RLENGTH-2)
    return k
  }
  # Pattern 5: Story X-Y or Story X.Y-Z in body
  if (match(msg, /Story [0-9]+[.-][0-9]+[a-z]?(-[0-9]+[a-z]?)?/)) {
    k = substr(msg, RSTART+6, RLENGTH-6)
    return k
  }
  # Pattern 6: SEC-N in body
  if (match(msg, /SEC-[0-9]+/)) {
    k = substr(msg, RSTART, RLENGTH)
    return toupper(k)
  }
  # Pattern 7: prep-N in body
  if (match(msg, /prep-[0-9]+/)) {
    k = substr(msg, RSTART, RLENGTH)
    return k
  }
  return "Uncategorized"
}

function extract_type(msg,   t) {
  if (match(msg, /^[a-z]+/)) {
    t = substr(msg, RSTART, RLENGTH)
    return t
  }
  return "other"
}

{
  hash = $1
  msg = substr($0, length($1)+2)
  key = extract_key(msg)
  ctype = extract_type(msg)
  total++

  # Track key order (first seen)
  if (!(key in count)) {
    key_order[++num_keys] = key
  }
  count[key]++
  types[key] = types[key] " " ctype
  commits[key] = commits[key] "\n  " $0

  # Track type counts per key
  type_count[key, ctype]++

  # Track build fix pattern
  lower_msg = tolower(msg)
  if (index(lower_msg, "typescript") || index(lower_msg, "build error") || index(lower_msg, "type error") || index(lower_msg, "ci build")) {
    build_fix[key]++
  }
}

END {
  # Count stories (exclude Uncategorized)
  story_count = num_keys
  if ("Uncategorized" in count) story_count--

  # Detect anomalies
  anomaly_total = 0
  for (k in count) {
    if (count[k] > high_thresh) {
      anomalies[k] = anomalies[k] "HIGH_COMMITS: " count[k] " commits (threshold: >" high_thresh ")\n"
      anomaly_total++
      has_anomaly[k] = 1
    }
    if (type_count[k, "fix"]+0 > fix_thresh) {
      anomalies[k] = anomalies[k] "FIX_CLUSTER: " type_count[k, "fix"] " fix commits (threshold: >" fix_thresh ")\n"
      anomaly_total++
      has_anomaly[k] = 1
    }
    if (type_count[k, "ci"]+0 > 0) {
      anomalies[k] = anomalies[k] "CI_COMMITS: " type_count[k, "ci"] " ci commit(s) -- pipeline changes mid-story\n"
      anomaly_total++
      has_anomaly[k] = 1
    }
    if (build_fix[k]+0 > 0) {
      anomalies[k] = anomalies[k] "BUILD_FIX: " build_fix[k] " commit(s) with build/type fix pattern\n"
      anomaly_total++
      has_anomaly[k] = 1
    }
  }

  # --- Output ---
  epic_label = ""
  if (epic_num != "") epic_label = "Epic " epic_num " "

  print ""
  print "## " epic_label "Commit Summary (" from_date " to " to_date ")"
  print ""
  print "Total: " total " commits | Stories: " story_count " | Anomalies: " anomaly_total
  print ""
  print "### Story Groups"

  # Output story groups in order (Uncategorized last)
  for (i = 1; i <= num_keys; i++) {
    k = key_order[i]
    if (k == "Uncategorized") continue

    # Build type summary
    delete seen_types
    type_str = ""
    n = split(types[k], type_arr, " ")
    for (j = 1; j <= n; j++) {
      if (type_arr[j] != "") seen_types[type_arr[j]]++
    }
    first = 1
    for (t in seen_types) {
      if (!first) type_str = type_str " "
      type_str = type_str t "(" seen_types[t] ")"
      first = 0
    }

    flag = ""
    if (k in has_anomaly) flag = " [!]"

    printf "  %-40s %d commits -- %s%s\n", k ":", count[k], type_str, flag
  }

  # Anomalies section
  if (anomaly_total > 0) {
    print ""
    print "### Anomalies"
    for (i = 1; i <= num_keys; i++) {
      k = key_order[i]
      if (!(k in anomalies)) continue
      n = split(anomalies[k], alines, "\n")
      for (j = 1; j <= n; j++) {
        if (alines[j] != "") {
          printf "  [!] %-20s %s\n", k ":", alines[j]
        }
      }
    }
  }

  # Uncategorized section
  if ("Uncategorized" in count) {
    print ""
    print "### Uncategorized"
    n = split(commits["Uncategorized"], clines, "\n")
    for (j = 1; j <= n; j++) {
      if (clines[j] != "") print clines[j]
    }

    # Tip when uncategorized rate is high
    uncat_pct = int(count["Uncategorized"] * 100 / total)
    if (uncat_pct > 30) {
      print ""
      printf "Tip: %d%% uncategorized. Add story keys to commits (e.g. \"fix(api): ... (Story 6-1)\") for better grouping.\n", uncat_pct
    }
  }

  print ""
}
'
