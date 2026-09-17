#!/usr/bin/env bash
# check-dashes-and-dates.sh
#
# House rules checker for Markdown, used by the ci job.
#
# Rule 1 (every Markdown file): no em dashes and no en dashes. Use commas,
#        colons, or parentheses instead.
# Rule 2 (docs/adr and docs/sessions only): no calendar dates or calendar
#        references. Decisions and briefs are sequenced, never scheduled.
#
# Usage:
#   scripts/check-dashes-and-dates.sh [file ...]
#
# With no arguments every tracked Markdown file is checked. The script only
# reads files; it changes nothing and needs no credentials.
set -uo pipefail

DASH_PATTERN='—|–'
DATE_PATTERN='\b[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}\b|\b[0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4}\b|\b(19|20)[0-9]{2}\b|\b(january|february|march|april|june|july|august|september|october|november|december)\b|\b(jan|feb|mar|apr|jun|jul|aug|sept|oct|nov|dec)\.? [0-9]{1,2}\b|\b[0-9]{1,2} (jan|feb|mar|apr|may|jun|jul|aug|sept|oct|nov|dec)\b|\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b'

status=0
checked=0

# scan <file> <label> <pattern> <case-insensitive: yes|no>
scan() {
  local file="$1" label="$2" pattern="$3" fold="$4" hits rc
  if [ "$fold" = "yes" ]; then
    hits=$(grep -nEi -- "$pattern" "$file")
  else
    hits=$(grep -nE -- "$pattern" "$file")
  fi
  rc=$?
  if [ "$rc" -eq 0 ]; then
    echo "error: $label in $file"
    echo "$hits" | sed 's/^/  /'
    status=1
  elif [ "$rc" -gt 1 ]; then
    echo "error: grep failed on $file (exit $rc)"
    status=1
  fi
}

files=("$@")
if [ "${#files[@]}" -eq 0 ]; then
  mapfile -t files < <(git ls-files '*.md' '*.markdown')
fi

for f in "${files[@]}"; do
  [ -f "$f" ] || continue
  case "$f" in
    *.md|*.markdown) ;;
    *) continue ;;
  esac
  checked=$((checked + 1))

  scan "$f" "em dash or en dash" "$DASH_PATTERN" no

  case "$f" in
    docs/adr/*|docs/sessions/*)
      scan "$f" "calendar date or calendar reference" "$DATE_PATTERN" yes
      ;;
  esac
done

if [ "$status" -eq 0 ]; then
  echo "dash and date check: $checked file(s) checked, clean"
fi

exit "$status"
