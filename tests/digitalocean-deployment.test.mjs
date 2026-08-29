// BOTM-DIGITALOCEAN-UNATTENDED-DEPLOYMENT-01 — offline, content-level
// proof for the repo-side deployment assets. These are plain-text systemd
// unit files and a shell script, not executable Node modules, so this
// suite parses their text content directly rather than importing them —
// still a genuine, mechanical check against silent drift (a future edit
// accidentally removing the pinned-ref requirement, hardcoding a host,
// embedding a credential, or duplicating BOTM's own retry/lock logic at
// the systemd level).

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

async function readDeployFile(name) {
  return readFile(new URL(`../deploy/${name}`, import.meta.url), "utf8");
}

// --- systemd service unit ---

test("service unit: ExecStart runs exactly `npm run unattended`, the canonical command", async () => {
  const unit = await readDeployFile("systemd/botm-unattended.service");
  assert.match(unit, /^ExecStart=.*npm run unattended\s*$/m);
});

test("service unit: Type=oneshot (one bounded cycle, not a long-running daemon)", async () => {
  const unit = await readDeployFile("systemd/botm-unattended.service");
  assert.match(unit, /^Type=oneshot\s*$/m);
});

test("service unit: runs as a dedicated non-root service user, never root", async () => {
  const unit = await readDeployFile("systemd/botm-unattended.service");
  assert.match(unit, /^User=botm\s*$/m);
  assert.doesNotMatch(unit, /^User=root\s*$/m);
});

test("service unit: WorkingDirectory is set to the documented application path", async () => {
  const unit = await readDeployFile("systemd/botm-unattended.service");
  assert.match(unit, /^WorkingDirectory=\/opt\/band-on-the-map\s*$/m);
});

test("service unit: does not duplicate BOTM's own retry logic — Restart=no", async () => {
  const unit = await readDeployFile("systemd/botm-unattended.service");
  assert.match(unit, /^Restart=no\s*$/m);
});

test("service unit: treats BOTM's own exit codes honestly — 0 (HEALTHY/DEGRADED) and 2 (overlap-refused) are both non-failure; FAILED (1) is not listed as success", async () => {
  const unit = await readDeployFile("systemd/botm-unattended.service");
  const match = /^SuccessExitStatus=(.+)$/m.exec(unit);
  assert.ok(match, "expected an explicit SuccessExitStatus= line");
  const codes = match[1].trim().split(/\s+/).map(Number);
  assert.deepEqual(codes.sort(), [0, 2]);
  assert.ok(!codes.includes(1), "exit 1 (FAILED) must never be treated as a systemd success");
});

test("service unit: logs go to the journal (journalctl-readable), never a raw file", async () => {
  const unit = await readDeployFile("systemd/botm-unattended.service");
  assert.match(unit, /^StandardOutput=journal\s*$/m);
  assert.match(unit, /^StandardError=journal\s*$/m);
});

test("service unit: has a bounded start timeout, not unbounded", async () => {
  const unit = await readDeployFile("systemd/botm-unattended.service");
  assert.match(unit, /^TimeoutStartSec=\S+/m);
});

// --- systemd timer unit ---

test("timer unit: schedules approximately twice daily, ~06:15 and ~18:15 UTC", async () => {
  const unit = await readDeployFile("systemd/botm-unattended.timer");
  const calendars = [...unit.matchAll(/^OnCalendar=(.+)$/gm)].map((m) => m[1].trim());
  assert.equal(calendars.length, 2, "expected exactly two OnCalendar= entries (twice daily)");
  assert.ok(calendars.some((c) => c.includes("06:15")), `expected a ~06:15 UTC entry, got: ${calendars}`);
  assert.ok(calendars.some((c) => c.includes("18:15")), `expected a ~18:15 UTC entry, got: ${calendars}`);
  assert.ok(calendars.every((c) => /UTC/.test(c)), "every OnCalendar= entry must be explicit UTC");
});

test("timer unit: Persistent=true — a missed run fires after recovery", async () => {
  const unit = await readDeployFile("systemd/botm-unattended.timer");
  assert.match(unit, /^Persistent=true\s*$/m);
});

test("timer unit: installs under timers.target (the standard systemd convention)", async () => {
  const unit = await readDeployFile("systemd/botm-unattended.timer");
  assert.match(unit, /^WantedBy=timers\.target\s*$/m);
});

// --- install.sh ---

test("install.sh: refuses to run without an explicit --ref (never a silent, moving branch pull)", async () => {
  const script = await readDeployFile("install.sh");
  assert.match(script, /ERROR: --ref=<git-sha-or-tag> is required/);
  // Strip comment lines first — the script's own doc comment explains, in
  // prose, that it never does a blind `git pull`; that explanatory mention
  // is fine and expected. What must never exist is an actually-EXECUTED
  // `git pull` command.
  const executableLines = script
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");
  assert.doesNotMatch(executableLines, /git pull/, "the update strategy must never execute a blind git pull");
});

test("install.sh: pins the checkout with a detached, explicit ref, not a branch tracking checkout", async () => {
  const script = await readDeployFile("install.sh");
  assert.match(script, /git .*checkout --detach "?\$REF"?/);
});

test("install.sh: creates a dedicated non-login system user, never runs the app as root", async () => {
  const script = await readDeployFile("install.sh");
  assert.match(script, /useradd --system --no-create-home --shell \/usr\/sbin\/nologin/);
});

test("install.sh: installs dependencies deterministically (npm ci), production-only", async () => {
  const script = await readDeployFile("install.sh");
  assert.match(script, /npm ci --omit=dev/);
});

test("install.sh: requires root/sudo before mutating system state", async () => {
  const script = await readDeployFile("install.sh");
  assert.match(script, /id -u.*-ne 0/);
});

test("install.sh: does NOT enable or start the unattended timer/service itself — that is a separate, deliberate manual step", async () => {
  const script = await readDeployFile("install.sh");
  // The script prints instructions (inside a `cat <<EOF ... EOF` heredoc)
  // that MENTION the enable command as the operator's next manual step —
  // that mention is fine. What must never exist is an actually-executed
  // `systemctl enable ... botm-unattended...` line, i.e. one appearing in
  // the script BEFORE the heredoc marker that only prints text.
  //
  // BEATMAPPED-PUBLICATION-SERVICE-DEPLOY-LIFECYCLE-01: this is
  // deliberately scoped to botm-unattended specifically now, not to
  // "systemctl enable" as a whole — install.sh now DOES enable
  // botm-publication.service unconditionally (a distinct, long-running
  // unit; see the dedicated tests below for why that divergence is
  // intentional and safe), while continuing to leave
  // botm-unattended.service/.timer exactly as before: installed/reloaded,
  // never enabled/started by this script.
  const heredocStart = script.indexOf("cat <<EOF");
  assert.ok(heredocStart > -1, "expected the script to print next-step instructions via a heredoc");
  const executableBody = script.slice(0, heredocStart);
  assert.doesNotMatch(
    executableBody,
    /systemctl enable[^\n]*botm-unattended/,
    "install.sh must never itself enable the unattended timer/service — only print it as the operator's next manual step",
  );
  assert.doesNotMatch(
    executableBody,
    /systemctl (start|restart)[^\n]*botm-unattended\.timer/,
    "install.sh must never itself start/restart the unattended timer",
  );
  assert.match(script, /NOT enabled\/started/);
});

// --- BEATMAPPED-PUBLICATION-SERVICE-DEPLOY-LIFECYCLE-01: publication service restart ---

test("install.sh: installs the repo-controlled botm-publication.service unit alongside the other two", async () => {
  const script = await readDeployFile("install.sh");
  assert.match(
    script,
    /install -m 0644 "\$APP_DIR\/deploy\/systemd\/botm-publication\.service" \/etc\/systemd\/system\/botm-publication\.service/,
  );
});

test("install.sh: installs all three unit files, then daemon-reloads, before restarting anything", async () => {
  const script = await readDeployFile("install.sh");
  // Use the EXECUTED lines only — the script's own header doc-comment
  // (lines ~41-42) mentions "systemd unit files ... systemctl daemon-reload"
  // in prose describing what the script does, which would otherwise be
  // found first by a naive indexOf and make this ordering check meaningless.
  const executableLines = script
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");
  const unattendedServiceIdx = executableLines.indexOf('install -m 0644 "$APP_DIR/deploy/systemd/botm-unattended.service"');
  const unattendedTimerIdx = executableLines.indexOf('install -m 0644 "$APP_DIR/deploy/systemd/botm-unattended.timer"');
  const publicationIdx = executableLines.indexOf('install -m 0644 "$APP_DIR/deploy/systemd/botm-publication.service"');
  const daemonReloadIdx = executableLines.indexOf("systemctl daemon-reload");
  const restartIdx = executableLines.indexOf("systemctl restart botm-publication.service");

  for (const idx of [unattendedServiceIdx, unattendedTimerIdx, publicationIdx, daemonReloadIdx, restartIdx]) {
    assert.ok(idx > -1, "expected to find every install/reload/restart step in install.sh");
  }
  assert.ok(unattendedServiceIdx < daemonReloadIdx, "unit install must precede daemon-reload");
  assert.ok(unattendedTimerIdx < daemonReloadIdx, "unit install must precede daemon-reload");
  assert.ok(publicationIdx < daemonReloadIdx, "publication unit install must precede daemon-reload");
  assert.ok(daemonReloadIdx < restartIdx, "daemon-reload must happen before the publication service is restarted");
});

test("install.sh: by DEFAULT (no --skip-publication-restart), restarts botm-publication.service (systemctl restart, not merely start) after code/deps are in place — unchanged from prior behaviour", async () => {
  const script = await readDeployFile("install.sh");
  const npmCiIdx = script.indexOf("npm ci --omit=dev");
  const chownIdx = script.indexOf("chown -R");
  const restartIdx = script.indexOf("systemctl restart botm-publication.service");
  assert.ok(restartIdx > -1, "expected a `systemctl restart botm-publication.service` reachable in the default (no-flag) path");
  assert.ok(restartIdx > npmCiIdx, "the publication service must be restarted AFTER new dependencies are installed");
  assert.ok(restartIdx > chownIdx, "the publication service must be restarted AFTER ownership is fixed to the botm user");
  // `restart` (not `start`) is required: `start` would silently do nothing
  // if the service was already running old code, defeating the entire
  // point of this fix (Node.js never hot-reloads ES modules).
  assert.doesNotMatch(script, /systemctl start botm-publication\.service/);
  // BEATMAPPED-APPROVED-CANDIDATE-DEPLOY-ONLY-MODE-01: the restart is now
  // reachable through an if/else on an explicit flag, not literally
  // unconditional line-for-line — but the restart must sit in the `else`
  // (flag-absent, default) branch, i.e. still gated on SKIP_PUBLICATION_RESTART
  // being false, never behind any other condition.
  const elseIdx = script.lastIndexOf("else", restartIdx);
  assert.ok(elseIdx > -1 && elseIdx < restartIdx, "the restart must live in the SKIP_PUBLICATION_RESTART else-branch");
});

// --- BEATMAPPED-APPROVED-CANDIDATE-DEPLOY-ONLY-MODE-01: --skip-publication-restart ---

test("install.sh: accepts an explicit --skip-publication-restart flag that skips the enable/restart/health-check entirely", async () => {
  const script = await readDeployFile("install.sh");
  assert.match(script, /--skip-publication-restart\) SKIP_PUBLICATION_RESTART=1/);
  assert.match(script, /if \[ "\$SKIP_PUBLICATION_RESTART" -eq 1 \]; then/);
  assert.match(script, /Skipping botm-publication\.service enable\/restart/);
  // When skipped, neither `systemctl enable` nor `systemctl restart` for
  // the publication service may run — confirm the enable/restart calls
  // only appear after the `else`, never before it or outside any branch.
  const ifIdx = script.indexOf('if [ "$SKIP_PUBLICATION_RESTART" -eq 1 ]; then');
  const elseIdx = script.indexOf("else", ifIdx);
  const enableIdx = script.indexOf("systemctl enable botm-publication.service", ifIdx);
  const restartIdx = script.indexOf("systemctl restart botm-publication.service", ifIdx);
  assert.ok(elseIdx > ifIdx && enableIdx > elseIdx && restartIdx > elseIdx, "enable/restart must only be reachable in the else (flag-absent) branch");
});

test("install.sh: --skip-publication-restart is driven purely by the explicit flag, never inferred from --ref or a branch/tag name", async () => {
  const script = await readDeployFile("install.sh");
  // The SKIP_PUBLICATION_RESTART decision must never reference $REF or
  // any branch-name pattern (e.g. "candidate/deploy") -- only the
  // literal --skip-publication-restart argument sets it.
  const decisionRegion = script.slice(script.indexOf('for arg in "$@"'), script.indexOf('if [ -z "$REF" ]'));
  assert.doesNotMatch(decisionRegion, /candidate\/deploy/, "must never infer trial behaviour from a candidate branch naming convention");
  assert.doesNotMatch(decisionRegion, /SKIP_PUBLICATION_RESTART=1.*REF/, "must never derive the skip decision from $REF");
});

test("install.sh: arg-parsing loop, executed for real in bash, sets SKIP_PUBLICATION_RESTART=1 only when the exact flag is passed, and 0 by default", async () => {
  // A genuine behavioural proof (not merely text matching) of the exact
  // arg-parsing region of install.sh -- extracted byte-for-byte and run as
  // real bash, same convention as tests/deploy-github-workflow.test.mjs's
  // embedded-script extraction.
  const script = await readDeployFile("install.sh");
  const startMarker = 'APP_DIR="/opt/band-on-the-map"';
  const endMarker = 'if [ -z "$REF" ]; then';
  const startIdx = script.indexOf(startMarker);
  const endIdx = script.indexOf(endMarker);
  assert.ok(startIdx > -1 && endIdx > startIdx, "expected to locate the variable-defaults-through-arg-parsing region");
  const region = script.slice(startIdx, endIdx);

  const dir = await mkdtemp(join(tmpdir(), "botm-install-argparse-"));
  try {
    const harnessPath = join(dir, "harness.sh");
    await writeFile(
      harnessPath,
      `#!/usr/bin/env bash\nset -euo pipefail\n${region}\necho "REF=$REF"\necho "SKIP_PUBLICATION_RESTART=$SKIP_PUBLICATION_RESTART"\n`,
    );

    const defaultRun = await execFileAsync("bash", [harnessPath, "--ref=abc123"]);
    assert.match(defaultRun.stdout, /REF=abc123/);
    assert.match(defaultRun.stdout, /SKIP_PUBLICATION_RESTART=0/, "the flag must default to 0 (off) when not passed");

    const flaggedRun = await execFileAsync("bash", [harnessPath, "--ref=abc123", "--skip-publication-restart"]);
    assert.match(flaggedRun.stdout, /REF=abc123/);
    assert.match(flaggedRun.stdout, /SKIP_PUBLICATION_RESTART=1/, "the flag must be 1 (on) when explicitly passed");

    // Order-independence: the flag is never positionally coupled to --ref.
    const reorderedRun = await execFileAsync("bash", [harnessPath, "--skip-publication-restart", "--ref=abc123"]);
    assert.match(reorderedRun.stdout, /SKIP_PUBLICATION_RESTART=1/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("install.sh: every other install step (fetch/checkout/npm-ci/systemd-unit-install/ownership) still runs regardless of --skip-publication-restart — only the publication restart itself is skipped", async () => {
  const script = await readDeployFile("install.sh");
  const ifIdx = script.indexOf('if [ "$SKIP_PUBLICATION_RESTART" -eq 1 ]; then');
  const preConditionalScript = script.slice(0, ifIdx);
  // npm ci, systemd unit installs, and chown must all appear BEFORE the
  // SKIP_PUBLICATION_RESTART branch — i.e. unconditionally, regardless of
  // the flag.
  assert.match(preConditionalScript, /npm ci --omit=dev/);
  assert.match(preConditionalScript, /install -m 0644 "\$APP_DIR\/deploy\/systemd\/botm-unattended\.service"/);
  assert.match(preConditionalScript, /install -m 0644 "\$APP_DIR\/deploy\/systemd\/botm-publication\.service"/);
  assert.match(preConditionalScript, /chown -R "\$SERVICE_USER:\$SERVICE_USER"/);
});

test("install.sh: enables botm-publication.service so it survives a reboot, unlike the unattended timer's deliberate manual gate", async () => {
  const script = await readDeployFile("install.sh");
  assert.match(script, /systemctl enable botm-publication\.service/);
});

test("install.sh: verifies the publication service actually came back active, and fails the deployment loudly if it did not", async () => {
  const script = await readDeployFile("install.sh");
  assert.match(script, /systemctl is-active --quiet botm-publication\.service/);
  // The check must be a real gate that can abort the script — i.e. an
  // `exit 1` reachable from a failed check — never merely logged/ignored.
  const checkIdx = script.indexOf("systemctl is-active --quiet botm-publication.service");
  const nextExit1Idx = script.indexOf("exit 1", checkIdx);
  assert.ok(nextExit1Idx > -1 && nextExit1Idx - checkIdx < 1000, "expected a nearby `exit 1` gating on the active-check result");
  // Must not be swallowed by an `|| true`-style suppression.
  assert.doesNotMatch(script, /systemctl is-active --quiet botm-publication\.service\s*\|\|\s*true/);
});

test("install.sh: does not add a second publication service or a new timer/scheduler", async () => {
  const script = await readDeployFile("install.sh");
  assert.doesNotMatch(script, /botm-publication-2|botm-publication-v2|new.{0,20}timer/i);
  const publicationMentions = (script.match(/botm-publication\.service/g) ?? []).length;
  assert.ok(publicationMentions >= 3, "expected botm-publication.service referenced by install, restart, and verify steps only");
});

test("install.sh: no Berlin-specific deployment behaviour is introduced", async () => {
  const script = await readDeployFile("install.sh");
  assert.doesNotMatch(script, /berlin/i);
});

test("install.sh: explicit --ref SHA-pinning behaviour is unchanged by the publication-service fix", async () => {
  const script = await readDeployFile("install.sh");
  assert.match(script, /ERROR: --ref=<git-sha-or-tag> is required/);
  assert.match(script, /git .*checkout --detach "?\$REF"?/);
});

// --- no embedded credentials/hosts anywhere in the deployment assets ---

const CREDENTIAL_LIKE_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/, // AWS access key id shape
  /\bpassword\s*=\s*["'][^"']+["']/i,
  /\bsecret\s*=\s*["'][^"']+["']/i,
  /\btoken\s*=\s*["'][^"']+["']/i,
  /ssh-(rsa|ed25519|dss)\s+AAAA/, // an embedded public key is still not appropriate here
];

test("no deployment asset embeds any credential-shaped string", async () => {
  for (const name of ["systemd/botm-unattended.service", "systemd/botm-unattended.timer", "install.sh", "README.md"]) {
    const content = await readDeployFile(name);
    for (const pattern of CREDENTIAL_LIKE_PATTERNS) {
      assert.doesNotMatch(content, pattern, `${name} appears to embed credential-shaped content matching ${pattern}`);
    }
  }
});

test("no deployment asset hardcodes a specific server IP address as the deploy target", async () => {
  const ipPattern = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;
  for (const name of ["systemd/botm-unattended.service", "systemd/botm-unattended.timer", "install.sh"]) {
    const content = await readDeployFile(name);
    assert.doesNotMatch(content, ipPattern, `${name} must never hardcode a literal IP address as the deployment target`);
  }
});

test("install.sh's default repo URL is the real, public BOTM GitHub repository (no embedded token/credential in the URL)", async () => {
  const script = await readDeployFile("install.sh");
  const match = /REPO_URL="([^"]+)"/.exec(script);
  assert.ok(match, "expected a default REPO_URL");
  assert.equal(match[1], "https://github.com/chriswatson6675/band_on_the_map.git");
  assert.doesNotMatch(match[1], /@/, "a repo URL containing '@' may embed inline credentials — must never be present");
});

// --- documents the critical publication-bridge finding, not just the happy path ---

test("deploy/README.md honestly documents the Netlify (not Vercel) static-import publication gap", async () => {
  const readme = await readDeployFile("README.md");
  assert.match(readme, /Netlify/);
  assert.match(readme, /statically\s+imports?/i);
  assert.match(readme, /NO\s+effect on the live public site/i);
});
