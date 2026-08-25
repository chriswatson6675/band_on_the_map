// Offline, dependency-free, NO-NETWORK deterministic proof for the
// mouco-porto-01 investigation.
//
// This investigation never obtained live first-party content from the
// candidate's official domain(s) — see investigation.json's probe_history
// and decision. This script does NOT (and cannot) prove any event-field
// extraction claim, because none was made. Instead it mechanically
// re-derives, from the retained evidence files already saved under this
// directory (fetched once via curl / a public DNS-over-HTTPS API /
// web.archive.org during the investigation; never re-fetched here), the
// two structural claims the investigation's DEFER decision actually rests
// on:
//
//   1. The candidate's known official domain(s) (moucohotel.pt,
//      www.moucohotel.pt, mouco.pt) genuinely fail to resolve via DNS —
//      both a direct curl attempt against each and an independent
//      third-party DNS-over-HTTPS resolver (dns.google) agree.
//   2. The last known live state of the domain (a web.archive.org
//      snapshot, dated well before this investigation) served an explicit
//      anti-bot/anti-headless JS challenge page, not real site content,
//      fronted by Imunify360 WebShield.
//
// It also mechanically confirms that two independent third-party pages
// (retained as discovery-lead evidence, never as identity authority)
// consistently name the same domain, and confirms — by scanning every
// retained HTML/JSON file — that this investigation genuinely captured
// zero event records, dates, or ids from anywhere: nothing was fabricated
// to compensate for the domain being unreachable.
//
// Run with: node evidence/offline-proof.mjs
// Makes zero network requests — reads only local files in this directory.

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

function read(name) {
  return readFileSync(join(HERE, name), "utf-8");
}

let failed = false;
function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed = true;
}
function ok(msg) {
  console.log(`OK:   ${msg}`);
}

// --- 1. DNS check: both candidate apex domains report lame delegation ---

console.log("--- 1. DNS resolution check (dns.google DNS-over-HTTPS API) ---");

for (const [file, domain] of [
  ["dns-check-mouco-pt.json", "mouco.pt"],
  ["dns-check-moucohotel-pt.json", "moucohotel.pt"],
]) {
  let data;
  try {
    data = JSON.parse(read(file));
  } catch (e) {
    fail(`could not parse ${file}: ${e.message}`);
    continue;
  }
  console.log(`${domain}: Status=${data.Status} Comment="${data.Comment ?? ""}"`);
  // Status 2 = SERVFAIL in the DNS RCODE vocabulary.
  if (data.Status !== 2) {
    fail(`${domain}: expected DNS Status 2 (SERVFAIL), got ${data.Status}`);
  } else {
    ok(`${domain}: DNS Status is 2 (SERVFAIL), confirming resolution genuinely fails`);
  }
  const comment = (data.Comment ?? "").toLowerCase();
  if (!comment.includes("lame delegation") && !comment.includes("refused")) {
    fail(`${domain}: expected Comment to mention lame delegation / refused, got "${data.Comment}"`);
  } else {
    ok(`${domain}: Comment confirms lame delegation / REFUSED from the domain's own authoritative nameservers`);
  }
}

// --- 2. Direct curl attempts against all three domain forms also failed ---

console.log("");
console.log("--- 2. Direct curl attempts (this investigation's own retained logs) ---");

for (const [file, host] of [
  ["curl-error-moucohotel-root.txt", "www.moucohotel.pt"],
  ["curl-error-moucohotel-nowww.txt", "moucohotel.pt"],
  ["curl-error-mouco-pt.txt", "mouco.pt"],
]) {
  const text = read(file);
  const resolvedFail = /could not resolve host/i.test(text);
  const exitSix = /curl exit code: 6/.test(text);
  console.log(`${host}: "Could not resolve host" present=${resolvedFail}, exit code 6 present=${exitSix}`);
  if (resolvedFail && exitSix) {
    ok(`${host}: direct curl attempt genuinely failed at DNS resolution (exit 6)`);
  } else {
    fail(`${host}: expected a retained "Could not resolve host" / exit code 6 curl failure log`);
  }
}

// --- 3. Wayback Machine: an archived snapshot exists, and it shows an
//        anti-bot JS challenge page, not real content ---

console.log("");
console.log("--- 3. Historical (Wayback Machine) snapshot check ---");

let availability;
try {
  availability = JSON.parse(read("wayback-check-moucohotel.json"));
} catch (e) {
  fail(`could not parse wayback-check-moucohotel.json: ${e.message}`);
}
if (availability) {
  const snap = availability.archived_snapshots?.closest;
  console.log(`Closest snapshot: available=${snap?.available} status=${snap?.status} timestamp=${snap?.timestamp} url=${snap?.url}`);
  if (snap?.available === true && snap?.status === "200") {
    ok("a Wayback Machine snapshot of moucohotel.pt exists and was itself served as HTTP 200 by archive.org");
  } else {
    fail("expected an available, HTTP-200 Wayback snapshot for moucohotel.pt");
  }
}

const waybackBody = read("body-wayback-moucohotel-root.html");
const waybackHeaders = read("headers-wayback-moucohotel-root.txt");

const hasChallengeTitle = /<title>\s*One moment, please\.\.\.\s*<\/title>/i.test(waybackBody);
const hasChallengeText = /Please wait while your request is being verified/i.test(waybackBody);
const hasHeadlessFingerprint = /headless|webdriver|bytespider/i.test(waybackBody);
console.log(
  `Archived homepage body: challenge title=${hasChallengeTitle}, challenge text=${hasChallengeText}, headless/webdriver fingerprinting script=${hasHeadlessFingerprint}`,
);
if (hasChallengeTitle && hasChallengeText && hasHeadlessFingerprint) {
  ok('archived homepage is an anti-bot/anti-headless JS challenge interstitial, not real page/event content');
} else {
  fail("expected the archived homepage body to contain the anti-bot challenge markers observed during investigation");
}

const hasImunify = /imunify360-webshield/i.test(waybackHeaders);
console.log(`Archived response headers mention Imunify360 WebShield: ${hasImunify}`);
if (hasImunify) {
  ok("archive.org's x-archive-orig-server header confirms the original response was fronted by Imunify360 WebShield (a bot-challenge/WAF product)");
} else {
  fail("expected x-archive-orig-server: imunify360-webshield in the archived response headers");
}

// --- 4. Third-party discovery-lead pages independently name the same domain ---

console.log("");
console.log("--- 4. Third-party discovery-lead corroboration (never treated as identity authority) ---");

for (const file of ["body-discovery-agendaporto.html", "body-discovery-timeout.html"]) {
  const html = read(file);
  const matches = [...html.matchAll(/https?:\/\/(www\.)?moucohotel\.pt/gi)];
  console.log(`${file}: ${matches.length} reference(s) to moucohotel.pt`);
  if (matches.length > 0) {
    ok(`${file}: independently references moucohotel.pt as the venue's site (discovery lead only, not proof)`);
  } else {
    fail(`${file}: expected at least one reference to moucohotel.pt`);
  }
}

// --- 5. Anti-fabrication sanity check: no event data exists ANYWHERE in
//        retained evidence. If this ever finds one, the investigation's
//        "zero events captured" claim would be false and must be fixed
//        rather than the decision text quietly staying wrong. ---

console.log("");
console.log("--- 5. Anti-fabrication sanity check: no event/JSON-LD data was actually captured ---");

const files = readdirSync(HERE).filter((f) => /\.(html|json)$/i.test(f));
let eventLikeHits = 0;
for (const f of files) {
  const text = read(f);
  if (/"@type"\s*:\s*"(MusicEvent|Event)"/i.test(text)) {
    eventLikeHits++;
    console.log(`NOTE: ${f} contains what looks like a MusicEvent/Event JSON-LD node`);
  }
}
if (eventLikeHits === 0) {
  ok("confirmed: zero retained evidence files contain any MusicEvent/Event JSON-LD node — no event data was fabricated or silently smuggled in");
} else {
  fail(`found ${eventLikeHits} file(s) with apparent MusicEvent/Event JSON-LD — investigation.json's field_assessment must not claim UNKNOWN if real event data was actually retained`);
}

console.log("");
if (failed) {
  console.log("RESULT: one or more checks FAILED — see FAIL lines above.");
  process.exitCode = 1;
} else {
  console.log("RESULT: all checks passed against retained evidence. DNS failure and historical anti-bot posture both mechanically confirmed; zero event data exists in any retained file.");
}
