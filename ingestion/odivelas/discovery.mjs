// Parses genuinely retrieved Câmara Municipal de Odivelas RSS-directory
// HTML (https://www.cm-odivelas.pt/rss-feed) to find the actual events
// feed URL.
//
// sources/lisbon.json records this source's acquisition_path_detail as
// "an '/rss-feed' link was directly observed on the culture page" — that
// page is itself only a directory of several distinct named feeds (during
// this task's own live check: "RSS de Notícias" at one path, "RSS de
// Eventos" at another), not the events feed itself. This module is the
// small, genuinely-needed discovery step that finds the one labelled "RSS
// de Eventos" among them, rather than hardcoding its path — a future
// change to the site's own feed listing/order is discovered correctly
// instead of silently reading the wrong feed.

const FEED_LINK_RE =
  /href="([^"]+)"[^>]*>\s*<h2[^>]*>\s*RSS de Eventos\s*<\/h2>/i;

/**
 * Find the "RSS de Eventos" feed URL from the RSS-directory page's own
 * HTML. Returns an absolute URL, or null if no such labelled link is
 * present (a legitimate, reportable discovery failure — never guessed).
 */
export function findEventsFeedUrl(html, { baseUrl = "https://www.cm-odivelas.pt" } = {}) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Odivelas RSS-directory HTML");
  }

  const match = FEED_LINK_RE.exec(html);
  if (!match) return null;

  const href = match[1];
  return href.startsWith("http") ? href : `${baseUrl}${href.startsWith("/") ? "" : "/"}${href}`;
}
