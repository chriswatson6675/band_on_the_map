// BEATMAPPED-UK-GC-FOOTBALL-PLATFORM-ACQUISITION-01 — platform detection.
//
// Detects the shared white-label football platform ("gc") that a large
// number of UK club sites are built on, and derives the per-tenant
// services host MECHANICALLY from the page's own public configuration.
//
// This module must never contain a club name, a club domain, a stadium
// name or a per-tenant constant. Detection is by platform signature only;
// every tenant-specific value is read from the served page. A test
// asserts this file contains no such literal.

/**
 * Every gc tenant serves its backend service hosts in the page as
 *   <one or more labels>.gc.<services-host>
 * e.g. matches.football.admin.gc.<tenant>services.co.uk
 *      streamline.web.gc.<tenant>services.co.uk
 *      images.gc.<tenant>services.co.uk
 *
 * The label depth varies by tenant build, so it is deliberately NOT
 * fixed: an earlier four-part form missed a genuine tenant whose page
 * only exposed the three-part `images.gc.<host>` shape.
 *
 * The <services-host> is the tenant key used by every gc API route, so it
 * is derived from these references rather than guessed from the domain.
 * Requiring it to be a dotted domain keeps unrelated `*.gc.ca`-style
 * hosts (which have a single label after `.gc.`) out.
 */
const GC_SERVICE_HOST = /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.gc\.([a-z0-9-]+(?:\.[a-z0-9-]+)+)\b/gi;

/** The platform's per-tenant club identifier, published in the page config. */
const CLUB_ID = /VUE_APP_CLUB_ID["'\s:=]{1,6}([A-Za-z0-9_-]+)/;

/**
 * Derive the candidate gc services hosts from a served page.
 *
 * A page may legitimately carry more than one: several tenants publish
 * the same estate under both a .co.uk and a .com services domain. Rather
 * than pick one by a naming rule, every candidate is returned, ranked so
 * that any host the page addresses its FOOTBALL service at is tried
 * first. Which candidate is real is settled against the live public API,
 * not guessed here — see collect.mjs.
 */
export function deriveServicesHost(html) {
  const text = typeof html === "string" ? html : "";
  const hosts = new Map();
  const references = [];

  for (const match of text.matchAll(GC_SERVICE_HOST)) {
    const reference = match[0].toLowerCase();
    const host = match[1].toLowerCase();
    // A reference to the platform's football service is the strongest
    // signal that this host serves fixtures.
    const football = /\.football\./.test(reference);
    hosts.set(host, (hosts.get(host) ?? false) || football);
    if (references.length < 8) references.push(reference);
  }

  const ranked = [...hosts.entries()]
    .sort((a, b) => Number(b[1]) - Number(a[1]) || a[0].localeCompare(b[0]))
    .map(([host]) => host);

  return {
    candidate_services_hosts: ranked,
    hosts_addressing_football_service: [...hosts.entries()].filter(([, football]) => football).map(([host]) => host),
    example_references: references,
  };
}

/**
 * Read the gc platform signature off a served page.
 *
 * This is deliberately only a HYPOTHESIS. A page signature cannot settle
 * membership on its own: several clubs use gc image/CMS hosting while
 * publishing fixtures elsewhere entirely, and they carry a gc signature
 * that looks identical to a real tenant's. The hypothesis is therefore
 * `PLATFORM_CANDIDATE`, and is only ever promoted to confirmed by the
 * live public fixture API answering for one of the candidate hosts.
 */
export function detectPlatform({ html, status } = {}) {
  const text = typeof html === "string" ? html : "";
  const derived = deriveServicesHost(text);
  const clubId = (text.match(CLUB_ID) || [])[1] ?? null;

  const signals = {
    http_status: status ?? null,
    gc_service_hosts_present: derived.candidate_services_hosts.length > 0,
    club_id_present: clubId !== null,
    addresses_football_service: derived.hosts_addressing_football_service.length > 0,
  };

  const detection = signals.gc_service_hosts_present ? "PLATFORM_CANDIDATE" : "NOT_GC_PLATFORM";

  return {
    detection,
    candidate_services_hosts: derived.candidate_services_hosts,
    club_id: clubId,
    signals,
    evidence: {
      candidate_services_hosts: derived.candidate_services_hosts,
      hosts_addressing_football_service: derived.hosts_addressing_football_service,
      example_references: derived.example_references,
    },
  };
}
