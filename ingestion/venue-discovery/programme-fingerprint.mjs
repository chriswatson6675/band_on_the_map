import { COLLECTOR_CAPABILITY_ROUTES, TECHNICAL_MECHANISMS } from "./research-state.mjs";

export const PROGRAMME_MECHANISMS = TECHNICAL_MECHANISMS;
export const COLLECTOR_ROUTES = COLLECTOR_CAPABILITY_ROUTES;

const PRIORITY = [
  "ACCESS_BLOCKED", "JSON_LD_EVENT", "MICRODATA", "PER_EVENT_ICS", "ICS_OR_ICAL",
  "WORDPRESS_TRIBE_API", "PUBLIC_GRAPHQL", "PUBLIC_REST_JSON", "PUBLIC_BROWSER_XHR",
  "EMBEDDED_NEXT_DATA", "EMBEDDED_NUXT_STATE", "EMBEDDED_SVELTEKIT_DATA", "OTHER_EMBEDDED_APP_STATE",
  "WIX_OR_FOURVENUES", "SQUARESPACE_CALENDAR", "WEBFLOW", "LIST_TO_DETAIL_HTML",
  "STATIC_HTML_CARDS", "IMAGE_OR_POSTER_PROGRAMME", "SOCIAL_FIRST_PROGRAMME",
  "CLIENT_RENDERED_UNKNOWN", "WORDPRESS_OTHER_API", "NO_CURRENT_PROGRAMME_FOUND", "OTHER",
];

const IMPLEMENTED_ZERO_CODE = new Set(["JSON_LD_EVENT", "ICS_OR_ICAL", "PER_EVENT_ICS", "WORDPRESS_TRIBE_API", "PUBLIC_REST_JSON"]);
const IMPLEMENTED_CONFIGURATION = new Set(["STATIC_HTML_CARDS", "LIST_TO_DETAIL_HTML"]);
const WIDENABLE = new Set([
  "MICRODATA", "WORDPRESS_OTHER_API", "EMBEDDED_NEXT_DATA", "EMBEDDED_NUXT_STATE",
  "EMBEDDED_SVELTEKIT_DATA", "OTHER_EMBEDDED_APP_STATE", "WEBFLOW", "WIX_OR_FOURVENUES",
  "SQUARESPACE_CALENDAR",
]);

function stringLinks(links) {
  return (links ?? []).map((link) => typeof link === "string" ? { url: link, text: "", role: null } : {
    url: link.url ?? "", text: link.text ?? "", role: link.role ?? null,
  });
}

export function fingerprintProgrammeSurface(input = {}) {
  const body = String(input.body ?? "");
  const contentType = String(input.content_type ?? input.contentType ?? "").toLowerCase();
  const url = String(input.url ?? "");
  const links = stringLinks(input.links);
  const requests = stringLinks(input.observed_requests ?? input.observedRequests);
  const detected = new Set();
  const signals = [];
  const add = (mechanism, signal) => { detected.add(mechanism); if (signal) signals.push(signal); };

  if ([401, 403, 429].includes(input.status) || input.access_blocked === true) add("ACCESS_BLOCKED", "Public acquisition was access-limited.");
  if (/application\/ld\+json/i.test(body) && /["']@type["']\s*:\s*["']Event["']/i.test(body)) add("JSON_LD_EVENT", "schema.org Event JSON-LD marker");
  if (/itemtype=["'][^"']*schema\.org\/(?:Event|MusicEvent)/i.test(body) || /itemprop=["']startDate["']/i.test(body)) add("MICRODATA", "schema.org event microdata marker");

  const icsLinks = links.filter((link) => /(?:webcal:|\.ics(?:[?#]|$)|ical)/i.test(link.url));
  if (/text\/calendar/.test(contentType) || /BEGIN:VEVENT/i.test(body) || /(?:webcal:|\.ics(?:[?#]|$))/i.test(url)) add("ICS_OR_ICAL", "iCalendar content or URL");
  if (icsLinks.some((link) => link.role === "EVENT_DOWNLOAD" || /add to calendar|download.*calendar/i.test(link.text))) add("PER_EVENT_ICS", "event-detail calendar download");
  else if (icsLinks.length) add("ICS_OR_ICAL", "linked iCalendar surface");

  if (/tribe-events|wp-json\/tribe\/events|the-events-calendar/i.test(body)) add("WORDPRESS_TRIBE_API", "WordPress Events Calendar marker");
  else if (/wp-content|wp-json|wordpress/i.test(body)) add("WORDPRESS_OTHER_API", "WordPress marker without a proven Tribe endpoint");
  if (/graphql/i.test(body) || requests.some((request) => /graphql/i.test(request.url))) add("PUBLIC_GRAPHQL", "observed GraphQL surface");
  if (/application\/json/.test(contentType) && /(?:event|startdate|start_date|programme|calendar)/i.test(body)) add("PUBLIC_REST_JSON", "public JSON response with event fields");
  if (requests.some((request) => /json|api|events|calendar/i.test(`${request.url} ${request.text}`))) add("PUBLIC_BROWSER_XHR", "public event-like browser request observed");

  if (/__NEXT_DATA__|\/_next\//i.test(body)) add("EMBEDDED_NEXT_DATA", "Next.js embedded state");
  if (/__NUXT__|\/_nuxt\//i.test(body)) add("EMBEDDED_NUXT_STATE", "Nuxt embedded state");
  if (/data-sveltekit|\/_app\/immutable|__data\.json/i.test(body)) add("EMBEDDED_SVELTEKIT_DATA", "SvelteKit embedded state");
  if (/application\/json/i.test(body) && /<script/i.test(body) && !detected.has("JSON_LD_EVENT")) add("OTHER_EMBEDDED_APP_STATE", "embedded application JSON");
  if (/wixstatic|wix-code|wix-events|fourvenues/i.test(body)) add("WIX_OR_FOURVENUES", "Wix/Fourvenues marker");
  if (/static1\.squarespace|squarespace/i.test(body)) add("SQUARESPACE_CALENDAR", "Squarespace marker");
  if (/data-wf-page|webflow/i.test(body)) add("WEBFLOW", "Webflow marker");

  const eventDetailLinks = links.filter((link) => link.role === "EVENT_DETAIL" || /event|concert|gig|show|veranstalt|konzert/i.test(`${link.text} ${link.url}`));
  if (eventDetailLinks.length >= 2) add("LIST_TO_DETAIL_HTML", "multiple event-detail links");
  if (/class=["'][^"']*(?:event|programme|calendar)[^"']*(?:card|item)|data-event-|itemprop=["']startDate/i.test(body)) add("STATIC_HTML_CARDS", "server-rendered event card marker");
  if (links.some((link) => /\.(?:jpg|jpeg|png|webp|pdf)(?:[?#]|$)/i.test(link.url) && /programm|programme|calendar|events|poster/i.test(`${link.text} ${link.url}`))) add("IMAGE_OR_POSTER_PROGRAMME", "programme image or poster link");
  if (input.social_first === true) add("SOCIAL_FIRST_PROGRAMME", "official programme is social-first");
  if (/<(?:div|main)[^>]+id=["'](?:root|app)["'][^>]*>\s*<\/|<script[^>]+src=/i.test(body) && eventDetailLinks.length === 0) add("CLIENT_RENDERED_UNKNOWN", "client shell without a resolved public data path");

  const programmeWords = /\b(event|events|programme|program|calendar|concert|gig|line[- ]?up|veranstaltung|konzert|spielplan)\b/i.test(body);
  if (detected.size === 0 && !programmeWords) add("NO_CURRENT_PROGRAMME_FOUND", "no current programme marker found in the supplied surface");
  else if (detected.size === 0) add("OTHER", "programme language exists without a known technical fingerprint");

  const mechanisms = [...detected].sort((a, b) => PRIORITY.indexOf(a) - PRIORITY.indexOf(b));
  return {
    mechanism: mechanisms[0],
    detected_mechanisms: mechanisms,
    signals: [...new Set(signals)],
    investigation_limited: detected.has("ACCESS_BLOCKED"),
    negative_venue_evidence: false,
  };
}

export function routeCollectorCapability(mechanism, options = {}) {
  if (!PROGRAMME_MECHANISMS.has(mechanism)) throw new Error(`unknown programme mechanism: ${mechanism}`);
  const implemented = new Set(options.implemented_mechanisms ?? [...IMPLEMENTED_ZERO_CODE, ...IMPLEMENTED_CONFIGURATION]);
  if (mechanism === "ACCESS_BLOCKED") return "CURRENTLY_BLOCKED";
  if (["NO_CURRENT_PROGRAMME_FOUND", "SOCIAL_FIRST_PROGRAMME", "IMAGE_OR_POSTER_PROGRAMME", "CLIENT_RENDERED_UNKNOWN", "OTHER"].includes(mechanism)) return "NEEDS_DEEPER_INVESTIGATION";
  if (implemented.has(mechanism)) return IMPLEMENTED_ZERO_CODE.has(mechanism) ? "EXISTING_COLLECTOR_ZERO_CODE" : "CONFIGURATION_ONLY";
  if (WIDENABLE.has(mechanism)) return "GENERIC_CAPABILITY_WIDENING";
  if (["PUBLIC_GRAPHQL", "PUBLIC_BROWSER_XHR"].includes(mechanism)) return "NEW_REUSABLE_COLLECTOR_FAMILY";
  return "NEEDS_DEEPER_INVESTIGATION";
}

export function justifyLikelyBespoke({ reusable_routes_considered = [], reason = "" } = {}) {
  const required = ["EXISTING_COLLECTOR_ZERO_CODE", "CONFIGURATION_ONLY", "GENERIC_CAPABILITY_WIDENING", "NEW_REUSABLE_COLLECTOR_FAMILY"];
  if (!required.every((route) => reusable_routes_considered.includes(route))) {
    throw new Error("LIKELY_BESPOKE requires every reusable collector route to be considered first");
  }
  if (typeof reason !== "string" || reason.trim().length < 20) throw new Error("LIKELY_BESPOKE requires a concrete justification");
  return "LIKELY_BESPOKE";
}
