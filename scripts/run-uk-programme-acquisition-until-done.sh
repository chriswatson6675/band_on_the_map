#!/usr/bin/env bash
# BEATMAPPED-UK-NATIONAL-VENUE-PROGRAMME-ACQUISITION-01 — auto-restarting
# wrapper. The underlying acquisition process has been observed to
# terminate silently (no error, no stack trace, exit code 0) after a
# couple of minutes when run directly in this environment, for reasons
# outside this package's own code (this repeats regardless of
# concurrency, and ingestion/uk-programme-acquisition/bounded-runner.mjs
# already catches and reports every per-item worker exception rather than
# letting one propagate — see its own doc comment). Rather than treat
# this as unsolvable, this wrapper leans on the SAME resumable checkpoint
# design (ingestion/uk-programme-acquisition/checkpoint.mjs) that already
# makes killing and restarting the process completely safe: every terminal
# source is skipped on the next attempt, so repeated restarts converge on
# a genuinely complete run regardless of how many times the underlying
# process dies early.
set -u
cd "$(dirname "$0")/.."

RUN_ID="${1:-uk-national-01}"
CONCURRENCY="${2:-20}"
PER_HOST="${3:-1}"
LOG_FILE="${4:-/tmp/uk-prog-acquisition-wrapper.log}"
TOTAL_CANDIDATES=1493
MAX_RESTARTS=200

echo "=== wrapper starting: run_id=$RUN_ID concurrency=$CONCURRENCY per_host=$PER_HOST ===" | tee -a "$LOG_FILE"

for attempt in $(seq 1 "$MAX_RESTARTS"); do
  DONE_COUNT=$(ls "runtime/uk-programme-acquisition/$RUN_ID/sources/" 2>/dev/null | wc -l)
  echo "=== wrapper attempt $attempt: $DONE_COUNT/$TOTAL_CANDIDATES already checkpointed ===" | tee -a "$LOG_FILE"

  if [ "$DONE_COUNT" -ge "$TOTAL_CANDIDATES" ]; then
    echo "=== wrapper: all candidates checkpointed, running one final pass to write sources/uk.json + research artifacts ===" | tee -a "$LOG_FILE"
    node ingestion/uk-programme-acquisition/run.mjs --run-id="$RUN_ID" --concurrency="$CONCURRENCY" --per-host="$PER_HOST" >> "$LOG_FILE" 2>&1
    echo "=== wrapper: final pass exited with code $? ===" | tee -a "$LOG_FILE"
    break
  fi

  node ingestion/uk-programme-acquisition/run.mjs --run-id="$RUN_ID" --concurrency="$CONCURRENCY" --per-host="$PER_HOST" >> "$LOG_FILE" 2>&1
  EXIT_CODE=$?
  echo "=== wrapper attempt $attempt: node exited with code $EXIT_CODE ===" | tee -a "$LOG_FILE"

  NEW_DONE_COUNT=$(ls "runtime/uk-programme-acquisition/$RUN_ID/sources/" 2>/dev/null | wc -l)
  if [ "$NEW_DONE_COUNT" -ge "$TOTAL_CANDIDATES" ]; then
    echo "=== wrapper: reached $NEW_DONE_COUNT/$TOTAL_CANDIDATES, will do one final pass on next loop iteration ===" | tee -a "$LOG_FILE"
  elif [ "$NEW_DONE_COUNT" -eq "$DONE_COUNT" ]; then
    echo "=== wrapper: NO PROGRESS this attempt ($DONE_COUNT -> $NEW_DONE_COUNT) — sleeping 5s before retry to avoid a tight crash loop ===" | tee -a "$LOG_FILE"
    sleep 5
  fi
done

echo "=== wrapper finished after attempt loop ===" | tee -a "$LOG_FILE"
