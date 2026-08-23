// Small, dependency-free RFC 5545 (iCalendar) parsing layer.
//
// Deliberately generic: this module must never reference any specific
// source (no source names, no hardcoded URLs). It consumes raw ICS text
// and returns SOURCE RECORD data only — plain VEVENT fields, unmodified
// beyond RFC 5545 line-unfolding and TEXT-value unescaping. It never
// invents a value that was not present in the input, never resolves a
// timezone against a database, and never produces a canonical Band on
// the Map Event identity (see docs/ARCHITECTURE.md: a parsed ICS event
// is source material for a future Observation, not an Event).
//
// Scope, deliberately bounded to what real observed ICS payloads in this
// project have needed so far:
//   - both CRLF and bare-LF line terminators, including a mix of both
//     within a single file
//   - RFC 5545 line folding (a continuation line beginning with a single
//     space or tab), even though no retained fixture currently uses it
//   - TEXT-value escaping: \\ \, \; \n \N
//   - DATE-TIME values in UTC form (trailing Z), TZID-qualified form, and
//     bare "floating" form
//   - DATE-only (all-day) values via VALUE=DATE
// It does NOT implement RRULE/RDATE/EXDATE recurrence expansion or a
// timezone database. If a future source's ICS genuinely requires either,
// stop and evaluate a narrowly-scoped, mature library rather than
// extending this parser to guess at that behaviour.

const CRLF_OR_LF = /\r\n|\n|\r/;

/**
 * Split raw ICS text into logical (unfolded) lines per RFC 5545 §3.1.
 * A line that begins with exactly one space or tab is a continuation of
 * the previous line; the fold marker (the leading space/tab) is removed
 * and the content is appended directly, with no space inserted.
 */
export function unfoldLines(text) {
  const physicalLines = text.split(CRLF_OR_LF);
  const logicalLines = [];

  for (const line of physicalLines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && logicalLines.length > 0) {
      logicalLines[logicalLines.length - 1] += line.slice(1);
    } else if (line !== "") {
      logicalLines.push(line);
    }
  }

  return logicalLines;
}

/**
 * Unescape an RFC 5545 TEXT value: \\ -> \, \, -> ,, \; -> ;, \n / \N -> newline.
 * Any other backslash-escaped character is left as-is (backslash dropped),
 * matching common real-world ICS producer behaviour rather than throwing.
 */
export function unescapeText(value) {
  let result = "";
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === "\\" && i + 1 < value.length) {
      const next = value[i + 1];
      if (next === "\\") result += "\\";
      else if (next === ",") result += ",";
      else if (next === ";") result += ";";
      else if (next === "n" || next === "N") result += "\n";
      else result += next;
      i++;
    } else {
      result += ch;
    }
  }
  return result;
}

/**
 * Parse one logical "NAME[;PARAM=VALUE[,VALUE2];...]:VALUE" line into its
 * property name, a params object, and the raw (still-escaped) value.
 * Splits on the first colon that is not inside a quoted param value.
 */
export function parsePropertyLine(line) {
  let inQuotes = false;
  let colonIndex = -1;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    if (ch === ":" && !inQuotes) {
      colonIndex = i;
      break;
    }
  }

  if (colonIndex === -1) {
    return { name: line, params: {}, value: "" };
  }

  const head = line.slice(0, colonIndex);
  const value = line.slice(colonIndex + 1);
  const [name, ...paramParts] = head.split(";");

  const params = {};
  for (const part of paramParts) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).toUpperCase();
    const raw = part.slice(eq + 1).replace(/^"|"$/g, "");
    params[key] = raw;
  }

  return { name: name.toUpperCase(), params, value };
}

/**
 * Parse a DATE-TIME or DATE property value into a small, honest structure.
 * Never fabricates a UTC instant when the source did not provide one:
 *   - trailing "Z"        -> isUTC: true,  iso is a real UTC ISO string
 *   - VALUE=DATE           -> isDate: true, iso is the calendar date only
 *   - TZID param present   -> tzid recorded, iso left null (no timezone
 *                              database lookup is performed)
 *   - none of the above    -> floating local time, iso left null
 */
export function parseDateTimeValue(params, rawValue) {
  const isDateOnly = params.VALUE === "DATE" || /^\d{8}$/.test(rawValue);
  const isUTC = rawValue.endsWith("Z");
  const tzid = params.TZID ?? null;

  const result = {
    raw: rawValue,
    isDate: isDateOnly,
    isUTC,
    tzid,
    iso: null,
  };

  if (isDateOnly) {
    const m = /^(\d{4})(\d{2})(\d{2})$/.exec(rawValue);
    if (m) result.iso = `${m[1]}-${m[2]}-${m[3]}`;
    return result;
  }

  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/.exec(rawValue);
  if (!m) return result; // unrecognised shape: preserve raw only, invent nothing

  const [, y, mo, d, h, mi, s] = m;
  if (isUTC) {
    result.iso = `${y}-${mo}-${d}T${h}:${mi}:${s}Z`;
  }
  // TZID-qualified or bare-floating values are intentionally left with
  // iso: null — converting them correctly requires a timezone database
  // this module does not carry, and guessing would be worse than absence.

  return result;
}

const SIMPLE_TEXT_FIELDS = {
  UID: "uid",
  SUMMARY: "summary",
  DESCRIPTION: "description",
  LOCATION: "location",
  URL: "url",
  STATUS: "status",
  ORGANIZER: "organizer",
};

const DATE_TIME_FIELDS = {
  DTSTART: "dtstart",
  DTEND: "dtend",
  DTSTAMP: "dtstamp",
};

/**
 * Parse one VEVENT block's already-unfolded property lines into a
 * SOURCE RECORD. `raw` retains the exact original block text (each
 * property line exactly as it appeared, joined with "\n") for provenance;
 * it is never rewritten or reformatted.
 */
function parseVEvent(lines) {
  const record = {
    uid: null,
    summary: null,
    description: null,
    location: null,
    url: null,
    status: null,
    organizer: null,
    dtstart: null,
    dtend: null,
    dtstamp: null,
    otherProperties: {},
    raw: lines.join("\n"),
  };

  for (const line of lines) {
    const { name, params, value } = parsePropertyLine(line);

    if (name in DATE_TIME_FIELDS) {
      record[DATE_TIME_FIELDS[name]] = parseDateTimeValue(params, value);
      continue;
    }

    if (name in SIMPLE_TEXT_FIELDS) {
      record[SIMPLE_TEXT_FIELDS[name]] = unescapeText(value);
      continue;
    }

    if (name === "BEGIN" || name === "END") continue;

    // Anything not explicitly modelled above (e.g. a future RRULE,
    // CATEGORIES, or a source-specific X- property) is preserved
    // verbatim rather than silently dropped or interpreted.
    record.otherProperties[name] = value;
  }

  return record;
}

/**
 * Parse raw ICS text (one or more VCALENDAR blocks, each with zero or
 * more VEVENT blocks) into a flat list of SOURCE RECORD events.
 *
 * This is deliberately NOT a canonical Event: it has no Band on the Map
 * Event identity, no deduplication, and no Venue resolution. It is the
 * per-property data a future Observation would be built from.
 */
export function parseICS(text) {
  if (typeof text !== "string" || text.trim() === "") {
    throw new Error("Expected non-empty ICS text");
  }

  const lines = unfoldLines(text);

  let calendarCount = 0;
  let currentProdid = null;
  let currentVersion = null;
  const events = [];

  let inEvent = false;
  let eventLines = [];

  for (const line of lines) {
    const upper = line.toUpperCase();

    if (upper === "BEGIN:VCALENDAR") {
      calendarCount++;
      continue;
    }
    if (upper === "END:VCALENDAR") continue;

    if (upper.startsWith("PRODID:")) {
      currentProdid = line.slice("PRODID:".length);
      continue;
    }
    if (upper.startsWith("VERSION:")) {
      currentVersion = line.slice("VERSION:".length);
      continue;
    }

    if (upper === "BEGIN:VEVENT") {
      inEvent = true;
      eventLines = [];
      continue;
    }

    if (upper === "END:VEVENT") {
      inEvent = false;
      const record = parseVEvent(eventLines);
      record.calendarProdid = currentProdid;
      record.calendarVersion = currentVersion;
      events.push(record);
      eventLines = [];
      continue;
    }

    if (inEvent) {
      eventLines.push(line);
    }
  }

  return { calendarCount, events };
}
