// BARCELONA-30-VENUE-POPULATION-01 — La Paloma (Barcelona)'s own
// bespoke, first-party, undocumented WordPress admin-ajax action
// (`action=event_controller`), queried one calendar month at a time via
// `mes`/`any` (Catalan for month/year) POST parameters. Proven live in
// research/source-investigations/la-paloma-barcelona-01/.
//
// This source's own `date_init` field is Catalan natural-language text
// (e.g. "divendres 4 de setembre de 2026 a les 23:59" — weekday, day,
// month name, year, time) rather than a machine date format. Parsing it
// is a deterministic, mechanical table lookup (a fixed Catalan
// month-name -> number table) plus a fixed-shape regex — never
// inference: every Catalan month name maps to exactly one calendar
// month, and the regex either matches this exact documented shape or it
// doesn't (in which case the field is left honestly unparsed, never
// guessed).

const CATALAN_MONTHS = {
  gener: "01",
  febrer: "02",
  març: "03",
  abril: "04",
  maig: "05",
  juny: "06",
  juliol: "07",
  agost: "08",
  setembre: "09",
  octubre: "10",
  novembre: "11",
  desembre: "12",
};

const CATALAN_DATE_RE = /(\d{1,2}) de ([a-zçà-ÿ]+) de (\d{4})(?: a les (\d{1,2}):(\d{2}))?/iu;

/**
 * Parse this source's own Catalan `date_init` text into
 * `{ date: "YYYY-MM-DD", time: "HH:MM" | null }`, or null if the text
 * does not match the documented shape (weekday is ignored — it is
 * redundant with the numeric date and never itself used to derive
 * anything) or names a month not in the fixed table above.
 */
export function parseLaPalomaCatalanDate(text) {
  if (typeof text !== "string") return null;
  const match = CATALAN_DATE_RE.exec(text.toLowerCase());
  if (!match) return null;
  const [, day, monthName, year, hour, minute] = match;
  const month = CATALAN_MONTHS[monthName];
  if (!month) return null;
  return {
    date: `${year}-${month}-${day.padStart(2, "0")}`,
    time: hour ? `${hour.padStart(2, "0")}:${minute}` : null,
  };
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * Parse one month's raw JSON array (client.mjs's fetchLaPalomaMonth())
 * into small, structured discovery records. Throws on a non-array body
 * — never silently returns an empty list for a malformed response.
 */
export function parseLaPalomaEvents(body) {
  let parsed;
  try {
    parsed = typeof body === "string" ? JSON.parse(body) : body;
  } catch (error) {
    throw new Error(`La Paloma response body is not valid JSON: ${error.message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error("La Paloma response body did not parse to a JSON array");
  }

  return parsed.map((raw) => {
    const parsedDate = parseLaPalomaCatalanDate(raw.date_init);
    return {
      source_record_id: raw.id != null ? String(raw.id) : null,
      title: nonEmptyString(raw.name),
      subtitle: nonEmptyString(raw.subtitle),
      category_text: nonEmptyString(raw.categoria),
      date_text: nonEmptyString(raw.date_init),
      date_iso: parsedDate?.date ?? null,
      time_text: parsedDate?.time ?? null,
      event_url: nonEmptyString(raw.link_plataforma_externa),
      image_url: nonEmptyString(raw.featured_image),
      sold_out: raw.soldout === 1 || raw.soldout === true,
    };
  });
}
