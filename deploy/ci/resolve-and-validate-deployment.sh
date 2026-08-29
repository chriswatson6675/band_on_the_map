#!/usr/bin/env bash
# BEATMAPPED-APPROVED-CANDIDATE-SHA-DEPLOYMENT-PATH-01
#
# The exact SHA-resolution and authorisation logic
# .github/workflows/deploy-beatmapped-collector.yml's "resolve-and-validate"
# job runs — extracted into its own script so it is the SAME code path the
# real workflow executes AND something tests/deploy-workflow-authorisation.test.mjs
# can invoke directly, against a real local git repository, without ever
# contacting GitHub Actions or production. No behaviour is duplicated
# between the workflow and this script; the workflow's own steps below
# just call this file.
#
# Usage:
#   resolve-and-validate-deployment.sh <MAIN|APPROVED_CANDIDATE> <requested-ref> <NORMAL_PUBLICATION|DEPLOY_ONLY>
#
# Must be run inside a git working directory where the relevant remote
# refs are already fetched: `origin/main` (for MAIN mode) and/or
# `refs/remotes/origin/candidate/deploy/*` (for APPROVED_CANDIDATE mode).
#
# On success: prints `RESOLVED_SHA=<full 40-char sha>` on its own stdout
# line and exits 0. On any failure: prints a human-readable reason to
# stderr and exits 1 -- fail closed, never a partial/ambiguous result.
#
# BEATMAPPED-APPROVED-CANDIDATE-DEPLOY-ONLY-MODE-01: a third positional
# argument, post_deploy_action, was added alongside mode/ref. Exactly two
# (mode, post_deploy_action) combinations are ever valid -- checked below
# BEFORE any git lookup, so an invalid combination never gets far enough
# to resolve a SHA or contact anything:
#   MAIN + NORMAL_PUBLICATION           -- the only combination MAIN
#                                          allows; normal deployment
#                                          behaviour, unchanged.
#   APPROVED_CANDIDATE + DEPLOY_ONLY    -- the only combination
#                                          APPROVED_CANDIDATE allows; an
#                                          unmerged candidate is never
#                                          eligible for NORMAL_PUBLICATION.
# MAIN + DEPLOY_ONLY and APPROVED_CANDIDATE + NORMAL_PUBLICATION are both
# rejected -- neither is silently inferred or silently ignored.

set -euo pipefail

MODE="${1:-}"
REQUESTED="${2:-}"
POST_DEPLOY_ACTION="${3:-}"

if [ "$MODE" != "MAIN" ] && [ "$MODE" != "APPROVED_CANDIDATE" ]; then
  echo "ERROR: mode must be MAIN or APPROVED_CANDIDATE, got '${MODE}'." >&2
  exit 1
fi
if [ "$POST_DEPLOY_ACTION" != "NORMAL_PUBLICATION" ] && [ "$POST_DEPLOY_ACTION" != "DEPLOY_ONLY" ]; then
  echo "ERROR: post_deploy_action must be NORMAL_PUBLICATION or DEPLOY_ONLY, got '${POST_DEPLOY_ACTION}'." >&2
  exit 1
fi
if [ "$MODE" = "MAIN" ] && [ "$POST_DEPLOY_ACTION" != "NORMAL_PUBLICATION" ]; then
  echo "ERROR: MAIN mode always performs normal deployment behaviour -- post_deploy_action must be NORMAL_PUBLICATION. DEPLOY_ONLY is only available for APPROVED_CANDIDATE mode trials." >&2
  exit 1
fi
if [ "$MODE" = "APPROVED_CANDIDATE" ] && [ "$POST_DEPLOY_ACTION" != "DEPLOY_ONLY" ]; then
  echo "ERROR: APPROVED_CANDIDATE mode never triggers acquisition/publication for an unmerged commit -- post_deploy_action must be DEPLOY_ONLY. An unmerged candidate is never eligible for NORMAL_PUBLICATION." >&2
  exit 1
fi
if [ -z "$REQUESTED" ]; then
  echo "ERROR: a requested ref/SHA is required." >&2
  exit 1
fi

# APPROVED_CANDIDATE mode's own identity requirement: the exact full
# 40-character commit SHA only -- checked BEFORE any git lookup, so a
# short SHA or a branch/tag name is rejected outright rather than
# silently resolved to "whatever that currently means".
if [ "$MODE" = "APPROVED_CANDIDATE" ] && ! printf '%s' "$REQUESTED" | grep -Eq '^[0-9a-f]{40}$'; then
  echo "ERROR: APPROVED_CANDIDATE mode requires the exact full 40-character commit SHA -- '${REQUESTED}' is not one (a short SHA or a branch/tag name is never accepted as the deployment identity in this mode)." >&2
  exit 1
fi

if ! git cat-file -e "${REQUESTED}^{commit}" 2>/dev/null; then
  echo "ERROR: requested ref '${REQUESTED}' does not resolve to any commit fetched from origin." >&2
  exit 1
fi

RESOLVED_SHA="$(git rev-parse "${REQUESTED}^{commit}")"

if [ "$MODE" = "MAIN" ]; then
  if git merge-base --is-ancestor "${RESOLVED_SHA}" origin/main; then
    echo "Main-history validation: PASS -- ${RESOLVED_SHA} is reachable from origin/main." >&2
  else
    echo "ERROR: refusing to deploy ${RESOLVED_SHA} -- it is NOT reachable from origin/main. An arbitrary branch/PR/fork commit is never deployable merely because its SHA exists. Only approved main history may be deployed in MAIN mode -- use APPROVED_CANDIDATE mode (with a candidate/deploy/* branch) for an explicitly-reviewed, unmerged commit instead." >&2
    exit 1
  fi
else
  # Tip EQUALITY, deliberately never mere ancestry: a candidate/deploy/*
  # branch exists only as a pointer to one exact, reviewed SHA (see
  # deploy/README.md) -- it must never accumulate its own commit history,
  # so "reachable from" would wrongly also authorise an earlier,
  # superseded commit on that same branch.
  AUTHORISED_BRANCH=""
  for candidate_ref in $(git for-each-ref --format='%(refname)' 'refs/remotes/origin/candidate/deploy/*' 2>/dev/null || true); do
    TIP="$(git rev-parse "$candidate_ref")"
    if [ "$TIP" = "$RESOLVED_SHA" ]; then
      AUTHORISED_BRANCH="${candidate_ref#refs/remotes/origin/}"
      break
    fi
  done

  if [ -z "$AUTHORISED_BRANCH" ]; then
    echo "ERROR: refusing to deploy ${RESOLVED_SHA} as an APPROVED_CANDIDATE -- it is not the exact current tip of any origin candidate/deploy/* branch. An arbitrary feature-branch commit, a PR commit, or a commit merely reachable from (but not equal to) a candidate branch's tip is never accepted as a deployable candidate." >&2
    exit 1
  fi
  echo "Candidate-branch validation: PASS -- ${RESOLVED_SHA} is the exact tip of origin/${AUTHORISED_BRANCH}." >&2
fi

echo "RESOLVED_SHA=${RESOLVED_SHA}"
