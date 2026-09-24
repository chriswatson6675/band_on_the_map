#!/usr/bin/env bash
set -euo pipefail

RUN_TOKEN="${1:-}"
if [[ ! "${RUN_TOKEN}" =~ ^gh-[1-9][0-9]*-[1-9][0-9]*$ ]]; then
  echo "Invalid cleanup token" >&2
  exit 1
fi

RESEARCH_ROOT="/tmp/beatmapped-research/${RUN_TOKEN}"
case "${RESEARCH_ROOT}" in
  /tmp/beatmapped-research/gh-*) ;;
  *) echo "Refusing cleanup outside controlled research root" >&2; exit 1 ;;
esac

PID_FILE="${RESEARCH_ROOT}/proof.pid"
if [ -f "${PID_FILE}" ]; then
  PROOF_PID="$(cat "${PID_FILE}")"
  if [[ "${PROOF_PID}" =~ ^[1-9][0-9]*$ ]] && kill -0 "${PROOF_PID}" 2>/dev/null; then
    SESSION_ID="$(ps -o sid= -p "${PROOF_PID}" | tr -d ' ')"
    COMMAND="$(ps -o args= -p "${PROOF_PID}")"
    if [ "${SESSION_ID}" = "${PROOF_PID}" ] && [[ "${COMMAND}" == *"${RESEARCH_ROOT}"* ]]; then
      kill -TERM -- "-${PROOF_PID}" 2>/dev/null || true
      for _ in 1 2 3 4 5; do kill -0 "${PROOF_PID}" 2>/dev/null || break; sleep 1; done
      if kill -0 "${PROOF_PID}" 2>/dev/null; then kill -KILL -- "-${PROOF_PID}" 2>/dev/null || true; fi
    else
      echo "Refusing to kill process not proven to belong to this run" >&2
      exit 1
    fi
  fi
fi

rm -rf -- "${RESEARCH_ROOT}"
