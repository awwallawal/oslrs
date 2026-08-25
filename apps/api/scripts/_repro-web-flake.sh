#!/usr/bin/env bash
# Chase a3-eslint-policy to a deterministic repro.
# Full suite, full parallelism (no VITEST_MAX_THREADS), full output captured.
# Stops on the FIRST run that reproduces, so the error text survives.
OUT=/c/Users/DELL/AppData/Local/Temp/claude/C--Users-DELL-Desktop-oslrs/9cd6bd2a-033f-40e7-b949-229d8c112c6f/scratchpad
cd /c/Users/DELL/wt-13-50/apps/web || exit 1
for i in 1 2 3 4 5; do
  free=$(powershell.exe -NoProfile -Command "[math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory/1MB,2)" 2>/dev/null | tr -d '\r')
  echo "=== run $i  free=${free}GB  $(date +%H:%M:%S) ===" >> "$OUT/repro-log.txt"
  pnpm vitest run > "$OUT/repro-$i.txt" 2>&1
  files=$(grep -aoE "Test Files.*" "$OUT/repro-$i.txt" | tail -1)
  echo "    $files" >> "$OUT/repro-log.txt"
  if grep -aq "a3-eslint-policy" "$OUT/repro-$i.txt" && grep -aq "FAIL" "$OUT/repro-$i.txt"; then
    echo "    *** REPRODUCED on run $i ***" >> "$OUT/repro-log.txt"
    exit 0
  fi
done
echo "    not reproduced in 5 runs" >> "$OUT/repro-log.txt"
