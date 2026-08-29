const EXPLICIT_RELOCATION_NOTICE = /(?:takes\s+place\s+at\s+the\s+following\s+(?:venue|location)|findet\s+(?:an|in)\s+(?:dem\s+)?folgenden\s+veranstaltungsort\s+statt)/iu;

function requireHttpUrl(value, field) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${field} must be an absolute HTTP(S) URL`);
  }
  if (!new Set(["http:", "https:"]).has(parsed.protocol)) {
    throw new Error(`${field} must be an absolute HTTP(S) URL`);
  }
  return parsed.href;
}

/**
 * Build the explicit provenance handoff for a URL that discovery has
 * already established and fetched as one individual event-detail page.
 * A technical source URL alone never enters this function and therefore
 * can never become an outbound event link by accident.
 *
 * A retained detail page that explicitly says the event is at another
 * venue suppresses the caller's fixed-venue override. The destination is
 * not guessed; the Observation remains unresolved unless structured
 * evidence identifies it elsewhere.
 */
export function createDetailPageHandoff({ detailPageUrl, pageText = "", venueNameOverride = null } = {}) {
  const eventDetailUrl = requireHttpUrl(detailPageUrl, "detailPageUrl");
  const venueRelocationNoticeDetected = EXPLICIT_RELOCATION_NOTICE.test(String(pageText ?? ""));
  return {
    sourceUrl: eventDetailUrl,
    eventDetailUrl,
    venueNameOverride: venueRelocationNoticeDetected ? null : venueNameOverride,
    venueRelocationNoticeDetected,
  };
}
