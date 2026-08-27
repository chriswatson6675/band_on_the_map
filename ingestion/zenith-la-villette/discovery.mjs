// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — Zénith Paris - La Villette's
// own bespoke static-HTML card parser — see
// research/source-investigations/zenith-la-villette-paris-01/. Every
// listing card repeats the identical `.card-show` structure (an artist
// name, a French-language date string, and a `/shows/{Name}-{id}` detail
// link). Genuinely bespoke markup, not shared by any other family this
// project already supports. At least one sampled card shows an "Annulé"
// (Cancelled) status with its date struck through (`<del>`) and no
// replacement date printed anywhere — such cards are retained (never
// silently dropped from extraction) but excluded from toObservations(),
// documented explicitly rather than fabricating a still-valid date for a
// cancelled show.

const CARD_START_RE = /class="card-show"\s*>/g;
const STATE_RE = /card-show__state"[^>]*>\s*([^<]*?)\s*<\/div>/;
const ARTIST_RE = /card-show__artist">\s*([^<]*?)\s*<\/div>/;
const DATE_BLOCK_RE = /class="card-show__date">([\s\S]*?)<\/div>/;
const DEL_RE = /<del>\s*([^<]*?)\s*<\/del>/;
const URL_RE = /href="(\/shows\/[^"]+)"/;

/**
 * Extract every event card from the venue's own programme page HTML.
 * Never throws on zero matches. Each returned card carries `cancelled`
 * (true only when the source's own markup marks it so) and `dateRaw`
 * exactly as the source presents it (still populated even when
 * `cancelled` is true — never dropped, never silently altered).
 */
export function extractEventCards(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Zénith Paris programme-page HTML");
  }
  const starts = [];
  let m;
  CARD_START_RE.lastIndex = 0;
  while ((m = CARD_START_RE.exec(html)) !== null) starts.push(m.index);

  const cards = [];
  for (let i = 0; i < starts.length; i++) {
    const block = html.slice(starts[i], starts[i + 1] ?? html.length);
    const artist = ARTIST_RE.exec(block);
    const url = URL_RE.exec(block);
    if (!artist || !url) continue;

    const stateMatch = STATE_RE.exec(block);
    const state = stateMatch ? stateMatch[1].trim() : null;

    const dateBlockMatch = DATE_BLOCK_RE.exec(block);
    const dateBlockText = dateBlockMatch ? dateBlockMatch[1] : "";
    const delMatch = DEL_RE.exec(dateBlockText);
    const dateRaw = delMatch ? delMatch[1].trim() : dateBlockText.replace(/\s+/g, " ").trim();

    cards.push({
      title: artist[1].trim(),
      dateRaw: dateRaw || null,
      eventUrl: url[1],
      cancelled: Boolean(delMatch) || state === "Annulé",
      stateText: state,
    });
  }
  return cards;
}
