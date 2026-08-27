// BARCELONA-30-VENUE-POPULATION-02 — L'Auditori de Barcelona's own
// bespoke WordPress plugin ("auditori-plugin") AJAX endpoint
// (`/wp-admin/admin-ajax.php?action=get_auditori_events_query`), a
// custom, first-party JSON API — NOT the standard Tribe Events Calendar
// plugin. Requires an `X-Requested-With: XMLHttpRequest` header (a plain
// GET without it returns an empty `[]`, a genuine, retained,
// deterministic behaviour — see
// research/source-investigations/l-auditori-barcelona-01/, not a
// guessed workaround).
//
// Real pagination is via a `from_date` cursor (the max `event_next_date`
// unix-seconds value seen in the previous batch), NOT the `page` query
// parameter — the site's own client-side JS (eventsarchive.js, retained
// under evidence/) sends `page: 1` on every request and advances purely
// via `from_date`; a caller using `page` alone would silently receive the
// SAME 30 records forever (verified live — see the investigation's own
// evidence). This module follows the site's OWN real pagination
// mechanism exactly, bounded by MAX_BATCHES so a malformed/looping
// response can never cause an unbounded crawl.
//
// L'Auditori's own feed cross-lists events at OTHER real, distinct
// Barcelona venues — partner halls where L'Auditori's own ensembles
// (OBC, La Banda Municipal de Barcelona) perform under its own season
// programme (Palau de la Música Catalana, several historic
// churches/monasteries, ESMUC, Sant Andreu Teatre, Casino de l'Aliança
// del Poblenou). Each of THESE is onboarded as its own separate,
// evidence-backed canonical venue (see venues/barcelona.json and
// venues/source-venue-mappings.json's VENUE_NAME-keyed entries below,
// resolved via `hall_obj.wp_post.post_title`) — matching this project's
// existing Jamboree->Paral-lel-62 cross-listing precedent. A handful of
// bare public squares/parks used for one-off outdoor community concerts
// (e.g. "Plaça del Congrés Eucarístic") are deliberately excluded — not
// genuinely a stable, ongoing "venue" identity, only a one-off location.

import { readFileSync } from "node:fs";
import { get } from "node:https";
import { rootCertificates } from "node:tls";
import { USER_AGENT } from "../http/fetch.mjs";

const AJAX_URL = "https://www.auditori.cat/wp-admin/admin-ajax.php";
const REFERER = "https://www.auditori.cat/en/events/";
const MAX_BATCHES = 20; // generous bound well above the ~8 batches observed at proof time (~240 records)
const REQUEST_TIMEOUT_MS = 20_000;
const AUDITORI_INTERMEDIATE_CA = readFileSync(
  new URL("./sectigo-public-server-authentication-ca-ov-r36.crt", import.meta.url),
  "utf8",
);
const AUDITORI_ROOT_CA = readFileSync(
  new URL("./sectigo-public-server-authentication-root-r46.crt", import.meta.url),
  "utf8",
);
const AUDITORI_CA_CHAIN = [...rootCertificates, AUDITORI_ROOT_CA, AUDITORI_INTERMEDIATE_CA];

/**
 * Source-scoped HTTPS transport for L'Auditori.
 *
 * The source's leaf is issued by Sectigo Public Server Authentication CA
 * OV R36, but Node cannot build that chain from the certificates supplied
 * by the server and its bundled roots. The corresponding newer R46 root is
 * also absent from Node's bundled roots. Retaining that exact public CA
 * chain here completes verification without disabling certificate or
 * hostname checks and without changing the trust path of any other source.
 * See the superseding governed evidence in
 * research/source-investigations/l-auditori-barcelona-02/.
 */
export function fetchAuditoriText(url, { timeoutMs = REQUEST_TIMEOUT_MS, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const retrievedAt = new Date().toISOString();
    const request = get(url, {
      ca: AUDITORI_CA_CHAIN,
      headers: { "User-Agent": USER_AGENT, ...headers },
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        const status = response.statusCode ?? 0;
        resolve({
          url,
          status,
          ok: status >= 200 && status < 300,
          contentType: response.headers["content-type"] ?? null,
          linkHeader: response.headers.link ?? null,
          text,
          retrievedAt,
        });
      });
    });

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`L'Auditori request timed out after ${timeoutMs}ms`));
    });
    request.on("error", reject);
  });
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

async function fetchOneBatch(fromDate, { fetchImpl = fetchAuditoriText } = {}) {
  const params = new URLSearchParams({ action: "get_auditori_events_query", page: "1", limit: "30", output_profile: "basic_card" });
  if (fromDate) params.set("from_date", String(fromDate));
  const res = await fetchImpl(`${AJAX_URL}?${params.toString()}`, {
    headers: { "X-Requested-With": "XMLHttpRequest", Referer: REFERER, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${res.url}`);
  const parsed = JSON.parse(res.text);
  if (!Array.isArray(parsed)) throw new Error("L'Auditori events query did not return a JSON array");
  return { records: parsed, retrievedAt: res.retrievedAt, sourceUrl: res.url };
}

/**
 * Fetch L'Auditori's own full future-inventory window by following the
 * site's own real `from_date` cursor pagination, deduplicating by `id`
 * (the API repeats an item already seen once the cursor stalls) and
 * stopping when a batch is short (< limit) or the cursor stops advancing
 * — never an unbounded crawl (MAX_BATCHES bound).
 */
export async function fetchAuditoriEvents({ fetchImpl } = {}) {
  const all = [];
  const seenIds = new Set();
  let fromDate = null;
  let retrievedAt = null;
  let sourceUrl = null;

  for (let i = 0; i < MAX_BATCHES; i++) {
    const batch = await fetchOneBatch(fromDate, { fetchImpl });
    retrievedAt = batch.retrievedAt;
    sourceUrl = batch.sourceUrl;
    if (batch.records.length === 0) break;

    let maxDate = 0;
    for (const record of batch.records) {
      const d = Number(record.event_next_date) || 0;
      if (d > maxDate) maxDate = d;
      if (!seenIds.has(record.id)) {
        seenIds.add(record.id);
        all.push(record);
      }
    }

    if (batch.records.length < 30) break; // last (short) page
    if (maxDate === 0 || maxDate === fromDate) break; // cursor stalled — stop rather than loop
    fromDate = maxDate;
  }

  return { records: all, retrievedAt, sourceUrl };
}

// Real music-programme categories observed live (this source's own
// `tax_ecategory_str`, sometimes a "/"-joined composite, e.g. "Symphonic /
// Social") — "Social"/"Educational" alone, and an empty/"(none)" category
// used exclusively for museum exhibitions/guided tours at proof time, are
// deliberately excluded. See
// research/source-investigations/l-auditori-barcelona-01/ for the full,
// retained category breakdown this list was derived from.
const MUSIC_CATEGORIES = new Set(["Symphonic", "Chamber Music", "Jazz & Pop", "New Music", "Early Music"]);

// A small number of real music-programme events carry NO ecategory at all
// but ARE genuinely part of a named, real music festival/biennial cicle
// (tax_cicles_str) — "Robert Gerhard Biennial" (contemporary
// music/poetry). Bounded, explicit, evidenced — never a generic "any
// cicle passes" rule.
const MUSIC_CICLES_WITHOUT_CATEGORY = new Set(["Robert Gerhard Biennial"]);

function decodeHtmlEntities(value) {
  if (typeof value !== "string") return value;
  return value
    .replace(/&#8217;/g, "’")
    .replace(/&#8211;/g, "–")
    .replace(/&amp;/g, "&");
}

/**
 * Filter already-fetched raw records down to genuine music-programme
 * events, per the bounded, evidenced category rule above. Returns
 * `{ musicRecords, rejectedRecords }` so a caller can honestly report
 * what was excluded (e.g. Social/Educational activities, museum
 * exhibitions/guided tours), never silently.
 */
export function filterAuditoriMusicEvents(records) {
  const musicRecords = [];
  const rejectedRecords = [];
  for (const record of records ?? []) {
    const categories = (record.tax_ecategory_str ?? "")
      .split("/")
      .map((c) => decodeHtmlEntities(c.trim()))
      .filter(Boolean);
    const cicles = (record.tax_cicles_str ?? "").split("/").map((c) => decodeHtmlEntities(c.trim()));
    const isMusic = categories.some((c) => MUSIC_CATEGORIES.has(c)) || cicles.some((c) => MUSIC_CICLES_WITHOUT_CATEGORY.has(c));
    (isMusic ? musicRecords : rejectedRecords).push(record);
  }
  return { musicRecords, rejectedRecords };
}

// L'Auditori's own halls (the physical building at Carrer de Lepant, 150)
// — every OTHER hall name observed in a music-filtered record is a
// cross-listed, separately-onboarded venue (see venues/barcelona.json /
// venues/source-venue-mappings.json). Exported for tests/documentation;
// resolution itself never branches on this set (it is purely a
// VENUE_NAME-keyed data-driven mapping table).
export const AUDITORI_OWN_HALLS = new Set([
  "Sala 1 Pau Casals",
  "Sala 2 Oriol Martorell",
  "Sala 3 Tete Montoliu",
  "Sala 4 Alicia de Larrocha",
  "Escenari Sala 1 Pau Casals",
  "Museu de la Música",
  "Sala de Teclats – Museu de la Música",
  "Sala d’Interactius – Museu de la Música",
  "Espai 5",
]);

/**
 * Normalise one raw, already music-filtered record into a small,
 * structured discovery record. Pure mapping only — never fabricates a
 * value the source did not supply.
 */
export function normaliseAuditoriRecord(raw) {
  const hallRaw = nonEmptyString(raw?.hall_obj?.wp_post?.post_title);
  return {
    source_record_id: raw?.id != null ? String(raw.id) : null,
    title: nonEmptyString(decodeHtmlEntities(raw?.wp_post?.post_title)),
    subtitle: nonEmptyString(decodeHtmlEntities(raw?.subtitle)),
    event_url: nonEmptyString(raw?.link),
    event_next_date_unix: Number(raw?.event_next_date) || null,
    event_date_text: nonEmptyString(raw?.event_date_text),
    hall: hallRaw ? decodeHtmlEntities(hallRaw) : null,
    price_text: nonEmptyString(raw?.price_text),
    category: nonEmptyString(raw?.tax_ecategory_str),
  };
}
