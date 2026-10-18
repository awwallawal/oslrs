#!/usr/bin/env bash
# Story 13-78 — a watchdog OUTSIDE the thing it watches.
#
# Runs every minute from /etc/cron.d/oslsr-health-watchdog (source: infra/cron/) on the
# VPS. It checks the API, PM2, Postgres and Redis, and pages the operator's Telegram chat
# on a STATE CHANGE: one DOWN message when a check has failed 2 runs in a row, one
# WORSE message if another check then fails 2 runs in a row, and one RECOVERED message
# when everything has passed 2 runs in a row. Nothing while the state is unchanged.
#
# Why it exists: on 2026-10-17 `pm2 update` dropped oslsr-api for 15 minutes (site 502)
# and nothing paged. The API's own alerts died with the API, and GitHub delays every
# schedule on this repo by hours, so uptime.yml cannot be the monitor.
#
# ⛔ Independence rules (AC3), do not "simplify" them away:
#   - bash + curl + docker CLI only for the watchdog itself: no node, tsx, pnpm or app
#     code. The 10-17 failure was in the Node/PM2 layer. (`pm2 jlist` is one of the
#     things being CHECKED; if node or pm2 is broken, that check fails, as it should.)
#   - .env is never `source`d. Only the keys needed are read, with grep, and no value
#     is ever printed. The bot token travels to curl on stdin, never on its argv.
#   - `pm2 jlist` output contains the app's whole environment (secrets): it is parsed
#     in memory and never printed.
#   - Never `set -e`: one failing probe must not abort the other probes.
#
# Every probe can be replaced (for tests) by a command string run with `bash -c`:
#   WATCHDOG_HEALTH_CMD  prints the HTTP status code of /api/v1/health
#   WATCHDOG_PM2_CMD     prints `pm2 jlist` JSON
#   WATCHDOG_PG_CMD      exit status 0 = postgres accepts connections
#   WATCHDOG_REDIS_CMD   prints PONG (REDISCLI_AUTH is exported to it)
#   WATCHDOG_SEND_CMD    sends $WATCHDOG_MESSAGE; non-zero exit = not sent
#                        ($TELEGRAM_BOT_TOKEN / $TELEGRAM_CHAT_ID are exported to it)
# plus WATCHDOG_STATE_DIR, WATCHDOG_ENV_FILE, WATCHDOG_LOG_FILE, WATCHDOG_PROBE_TIMEOUT and
# WATCHDOG_NOW (epoch seconds, a fake clock). Defaults are the real commands and the real prod paths.
set -u

STATE_DIR="${WATCHDOG_STATE_DIR:-/var/lib/oslsr-watchdog}"
ENV_FILE="${WATCHDOG_ENV_FILE:-/root/oslrs/.env}"
LOG_FILE="${WATCHDOG_LOG_FILE:-/var/log/oslsr-health-watchdog.log}"

# A component is DOWN after this many consecutive failing runs (~2 minutes). One blip,
# such as a deploy's `pm2 restart`, never pages. Deliberately not overridable.
CONFIRM_RUNS=2
# Seconds per probe; overridable only so the hung-probe test need not wait 10 s.
PROBE_TIMEOUT="${WATCHDOG_PROBE_TIMEOUT:-10}"
# The log caps itself (AC4) instead of relying on a logrotate file: one install step
# instead of two, and a forgotten logrotate install cannot fill the disk. One line a
# minute is ~150 KB a day, so 1 MiB is about a week; the newest 512 KiB is kept.
LOG_MAX_BYTES=1048576
LOG_KEEP_BYTES=524288

# Every time printed is UTC. bash's printf %(...)T is used instead of date(1): no fork.
export TZ=UTC0
now() { if [ -n "${WATCHDOG_NOW:-}" ]; then echo "$WATCHDOG_NOW"; else printf '%(%s)T' -1; fi; }
log() { printf '%(%Y-%m-%dT%H:%M:%SZ)T %s\n' -1 "$*"; }
hhmm() { printf '%(%H:%M)T' "$1"; }

fmt_dur() {
  local s=$1
  if [ "$s" -ge 3600 ]; then printf '%dh %dm' $((s / 3600)) $((s % 3600 / 60))
  elif [ "$s" -ge 60 ]; then printf '%dm %ds' $((s / 60)) $((s % 60))
  else printf '%ds' "$s"; fi
}

# Value of KEY in the env file, or empty. Never sources the file, never prints.
env_value() {
  local v
  [ -r "$ENV_FILE" ] || return 0
  v=$(grep -m1 "^$1=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '\r')
  v=${v#\"}; v=${v%\"}
  printf '%s' "$v"
}

# Decodes %XX only. Not `printf %b` over the whole string: that would also interpret any
# backslash in the password (`\c` truncates it) — code review 13-78 L5.
url_decode() {
  local s=$1 out="" c
  while [ -n "$s" ]; do
    case $s in
      %[0-9A-Fa-f][0-9A-Fa-f]*) printf -v c '%b' "\\x${s:1:2}"; out+=$c; s=${s:3} ;;
      *) out+=${s:0:1}; s=${s:1} ;;
    esac
  done
  printf '%s' "$out"
}

# Space-separated component lists (api pm2 postgres redis).
in_list() { case " $1 " in *" $2 "*) return 0 ;; esac; return 1; }
union() { local out=$1 c; for c in $2; do in_list "$out" "$c" || out="${out:+$out }$c"; done; printf '%s' "$out"; }
pretty() { local s=$1; printf '%s' "${s// /, }"; }

# State is one small file per key in STATE_DIR; writes go through a temp file and mv.
get() { local f="$STATE_DIR/$1"; if [ -f "$f" ]; then printf '%s' "$(< "$f")"; else printf '%s' "${2:-}"; fi; }
put() { printf '%s' "$2" > "$STATE_DIR/$1.tmp" && mv -f "$STATE_DIR/$1.tmp" "$STATE_DIR/$1"; }
del() { rm -f "$STATE_DIR/$1"; }

# run_cmd OVERRIDE CMD...: the override string if set, else the real command; both
# behind a timeout so a hung docker exec cannot hang the watchdog.
run_cmd() {
  local override=$1; shift
  if [ -n "$override" ]; then timeout "$PROBE_TIMEOUT" bash -c "$override"
  else timeout "$PROBE_TIMEOUT" "$@"; fi
}

# AC1a — liveness only. The deep /api/v1/system/health route is super-admin-only and
# must not be used or opened up for this.
probe_api() {
  local code
  code=$(run_cmd "${WATCHDOG_HEALTH_CMD:-}" curl -s -o /dev/null -w '%{http_code}' --max-time 5 \
    http://127.0.0.1:3000/api/v1/health 2>/dev/null)
  [ "$code" = "200" ]
}

# AC1b — PM2 has oslsr-api AND it is online (the exact 10-17 shape: PM2 alive, app gone).
# `pm2 jlist` is one compact JSON array; each process object starts `{"pid":N,"name":"…"`
# and carries exactly one "status" key (measured on prod 2026-10-18). Split it into one
# line per process and look only at the oslsr-api line.
probe_pm2() {
  local json line
  json=$(run_cmd "${WATCHDOG_PM2_CMD:-}" pm2 jlist 2>/dev/null) || return 1
  while IFS= read -r line; do
    if [[ $line =~ ^\{\"pid\":-?[0-9]+,\"name\":\"oslsr-api\" ]]; then
      [[ $line == *'"status":"online"'* ]] && return 0
    fi
  done < <(printf '%s\n' "$json" | sed 's/{"pid":/\n{"pid":/g')
  return 1
}

# AC1c
probe_pg() {
  run_cmd "${WATCHDOG_PG_CMD:-}" docker exec oslsr-postgres pg_isready -U oslsr_user -d oslsr_db \
    > /dev/null 2>&1
}

# AC1d — the password is the one inside REDIS_URL (the REDIS_PASSWORD key answers
# WRONGPASS, measured 2026-10-15). It reaches redis-cli through REDISCLI_AUTH, which
# `docker exec -e REDISCLI_AUTH` copies from this process's environment, so it is on
# no command line (`ps`) and never printed.
probe_redis() {
  local url rest pw="" out
  url=$(env_value REDIS_URL)
  rest=${url#*://}
  if [ -n "$url" ] && [ "$rest" != "${rest%@*}" ]; then
    pw=${rest%@*}; pw=${pw#*:}
    pw=$(url_decode "$pw")
  fi
  out=$(
    if [ -n "$pw" ]; then export REDISCLI_AUTH="$pw"; fi
    run_cmd "${WATCHDOG_REDIS_CMD:-}" docker exec -e REDISCLI_AUTH oslsr-redis redis-cli ping 2>/dev/null
  )
  [ "$(printf '%s' "$out" | tr -d '\r\n ')" = "PONG" ]
}

# send_page TEXT → 0 only if Telegram accepted it. The token goes to curl in a config
# read from stdin, and is scrubbed from any error text before that is logged.
send_page() {
  local token chat err rc
  token=$(env_value TELEGRAM_BOT_TOKEN)
  chat=$(env_value TELEGRAM_OPERATOR_CHAT_ID)
  if [ -z "$token" ] || [ -z "$chat" ]; then
    log "ERROR: TELEGRAM_BOT_TOKEN or TELEGRAM_OPERATOR_CHAT_ID is missing from $ENV_FILE. Page NOT sent; retrying next run."
    send_failed
    return 1
  fi
  if [ -n "${WATCHDOG_SEND_CMD:-}" ]; then
    err=$(
      export WATCHDOG_MESSAGE="$1" TELEGRAM_BOT_TOKEN="$token" TELEGRAM_CHAT_ID="$chat"
      timeout 30 bash -c "$WATCHDOG_SEND_CMD" 2>&1 > /dev/null
    )
    rc=$?
  else
    err=$(printf 'url = "https://api.telegram.org/bot%s/sendMessage"\n' "$token" \
      | timeout 30 curl -fsS --max-time 20 -K - \
          --data-urlencode "chat_id=${chat}" --data-urlencode "text=$1" 2>&1 > /dev/null)
    rc=$?
  fi
  if [ "$rc" -ne 0 ]; then
    err=${err//"$token"/***}
    log "ERROR: page send failed (exit ${rc}): ${err}. Retrying next run."
    send_failed
    return 1
  fi
  del page_failing_since
  return 0
}

# Code review 13-78 L2: the heartbeat alone says "running", not "able to page". The
# first failed send records when sends started failing; the deploy job warns once that
# is older than 10 minutes. A successful send clears it.
send_failed() { [ -f "$STATE_DIR/page_failing_since" ] || put page_failing_since "$(now)"; }

cap_log() {
  local size
  [ -f "$LOG_FILE" ] || return 0
  size=$(wc -c < "$LOG_FILE" 2>/dev/null || echo 0)
  if [ "$size" -gt "$LOG_MAX_BYTES" ]; then
    # Truncate IN PLACE (cat >, not mv): cron's shell holds the file open for append.
    tail -c "$LOG_KEEP_BYTES" "$LOG_FILE" > "$LOG_FILE.tmp" && cat "$LOG_FILE.tmp" > "$LOG_FILE"
    rm -f "$LOG_FILE.tmp"
  fi
}

describe() {
  case $1 in
    api) echo "api: /api/v1/health did not answer 200" ;;
    pm2) echo "pm2: no online oslsr-api in pm2 jlist" ;;
    postgres) echo "postgres: pg_isready failed" ;;
    redis) echo "redis: no PONG" ;;
  esac
}

main() {
  if ! mkdir -p "$STATE_DIR" 2> /dev/null; then
    log "ERROR: cannot create state dir $STATE_DIR"
    exit 1
  fi

  # AC3 — an overrunning run is skipped, never stacked. flock is on the VPS (measured
  # 2026-10-18); without it (Git Bash on a laptop) the run goes ahead unlocked, loudly.
  if command -v flock > /dev/null 2>&1; then
    exec 9> "$STATE_DIR/lock"
    if ! flock -n 9; then
      log "skip: the previous run still holds the lock"
      exit 0
    fi
  else
    log "WARN: flock not found; running without an overlap lock"
  fi

  cap_log

  local t failed=() failing checks status fails first_fail host oks first_ok c
  t=$(now)
  host=$(hostname 2> /dev/null || echo vps)
  probe_api || failed+=(api)
  probe_pm2 || failed+=(pm2)
  probe_pg || failed+=(postgres)
  probe_redis || failed+=(redis)
  failing="${failed[*]:-}"  # space-separated, e.g. "api pm2"
  checks=$(pretty "$failing")

  status=$(get status up)
  fails=$(get fails 0)

  # State files while DOWN:
  #   down_checks  every component that failed during this outage (named in RECOVERED)
  #   down_paged   1 once the DOWN page was delivered
  #   paged_checks the components the operator has been told about (DOWN + WORSE pages)
  #   worse_seen   newly failing components seen on the previous run (WORSE confirmation)
  #   oks/first_ok the passing streak that must reach CONFIRM_RUNS before RECOVERED
  if [ -n "$failing" ]; then
    fails=$((fails + 1))
    put fails "$fails"
    [ "$fails" -eq 1 ] && put first_fail "$t"
    first_fail=$(get first_fail "$t")
    del oks; del first_ok  # a failing run breaks any recovery streak

    if [ "$status" = up ] && [ "$fails" -ge "$CONFIRM_RUNS" ]; then
      status=down
      put status down
      put down_checks "$failing"
      put down_paged 0
      del paged_checks; del worse_seen
      del recover_msg  # a newer outage supersedes an unsent RECOVERED
      log "DOWN confirmed: ${checks} (${fails} failing runs in a row)"
    fi

    if [ "$status" = down ]; then
      put down_checks "$(union "$(get down_checks)" "$failing")"
      if [ "$(get down_paged 0)" != 1 ]; then
        local detail=""
        for c in $failing; do detail+="
- $(describe "$c")"; done
        if send_page "🚨 OSLRS DOWN (watchdog on ${host}): ${checks}. Failing since $(hhmm "$first_fail") UTC, ${fails} checks in a row.${detail}
Triage: ssh in, then pm2 ls ; docker ps
One RECOVERED message follows when every check passes."; then
          put down_paged 1
          put paged_checks "$failing"
          log "paged DOWN: ${checks}"
        fi
      else
        # Code review 13-78 M2: an outage that gets WORSE (redis first, then the API) used
        # to stay silent. A component the operator was not told about pages ONE "WORSE"
        # once it has failed CONFIRM_RUNS runs in a row (here: this run and the previous).
        local paged new="" prev confirmed="" detail=""
        paged=$(get paged_checks)
        for c in $failing; do in_list "$paged" "$c" || new="${new:+$new }$c"; done
        if [ -n "$new" ]; then
          prev=$(get worse_seen)
          for c in $new; do in_list "$prev" "$c" && confirmed="${confirmed:+$confirmed }$c"; done
          put worse_seen "$new"
          if [ -n "$confirmed" ]; then
            for c in $confirmed; do detail+="
- $(describe "$c")"; done
            if send_page "⚠️ OSLRS WORSE (watchdog on ${host}): now also failing: $(pretty "$confirmed"). Failing now: ${checks}. Down since $(hhmm "$first_fail") UTC.${detail}
Triage: ssh in, then pm2 ls ; docker ps"; then
              put paged_checks "$(union "$paged" "$confirmed")"
              log "paged WORSE: $(pretty "$confirmed")"
            fi
          fi
        else
          del worse_seen
        fi
      fi
    fi
    log "fail: ${checks} (run ${fails}, state ${status})"
  else
    if [ "$status" = down ]; then
      # Code review 13-78 M1: recovery is confirmed like an outage is, by CONFIRM_RUNS
      # passing runs in a row. With one, a crash-looping API paged DOWN + RECOVERED every
      # ~3 minutes (measured: 8 pages in 12 min).
      oks=$(( $(get oks 0) + 1 ))
      put oks "$oks"
      [ "$oks" -eq 1 ] && put first_ok "$t"
      if [ "$oks" -ge "$CONFIRM_RUNS" ]; then
        first_fail=$(get first_fail "$t")
        first_ok=$(get first_ok "$t")
        local note=""
        [ "$(get down_paged 0)" != 1 ] && note="
(The DOWN page for this outage could not be sent.)"
        put recover_msg "✅ OSLRS RECOVERED (watchdog on ${host}): every check passes again. Down about $(fmt_dur $((first_ok - first_fail))) ($(pretty "$(get down_checks ?)"); first failure $(hhmm "$first_fail") UTC).${note}"
        status=up
        put status up
        del down_checks; del down_paged; del paged_checks; del worse_seen; del oks; del first_ok
        log "RECOVERED after $(fmt_dur $((first_ok - first_fail)))"
      fi
    fi
    if [ "$status" = up ]; then
      put fails 0
      del first_fail
    fi
    if [ -f "$STATE_DIR/recover_msg" ]; then
      if send_page "$(get recover_msg)"; then
        del recover_msg
        log "paged RECOVERED"
      fi
    fi
    if [ "$status" = up ]; then log "ok"; else log "ok, still DOWN: ${oks} of ${CONFIRM_RUNS} passing runs needed"; fi
  fi

  # AC5 — the heartbeat the deploy job reads. A stale one means the watchdog stopped.
  put last-run "$t"
}

main "$@"
