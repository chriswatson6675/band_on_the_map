export const SOURCE_NAME = "Agenda Cultural de Lisboa";
export const SOURCE_ENDPOINT = "https://www.agendalx.pt/wp-json/agendalx/v1/events";
export const USER_AGENT =
  "BandOnTheMap/0.1 source-contract-proof (https://github.com/chriswatson6675/band_on_the_map)";

export const MUSIC_VALUES = new Set([
  "musica",
  "música",
  "music",
  "concerto",
  "concertos",
  "concert",
  "festival",
  "festivais",
]);

export function normaliseText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

export function asArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value === null || value === undefined || value === "") {
    return [];
  }

  return [value];
}

export function termValues(value) {
  if (Array.isArray(value)) {
    return value.flatMap((item) => termValues(item));
  }

  if (value && typeof value === "object") {
    return Object.values(value).flatMap((item) => {
      if (item && typeof item === "object") {
        return [item.name, item.slug].filter(Boolean);
      }
      return termValues(item);
    });
  }

  return asArray(value);
}

export function getClassificationValues(record) {
  const values = [
    record?.subject,
    ...termValues(record?.categories_name_list),
    ...termValues(record?.tags_name_list),
    ...termValues(record?.tags),
    ...termValues(record?.categories),
  ];

  return values
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
}

export function classifyMusicRecord(record) {
  const values = getClassificationValues(record);
  const matchedValues = values.filter((value) =>
    MUSIC_VALUES.has(normaliseText(value)),
  );

  return {
    isMusic: matchedValues.length > 0,
    matchedValues,
    inspectedValues: values,
  };
}

export function parseJsonPayload(text, contentType) {
  if (!contentType?.toLowerCase().includes("application/json")) {
    throw new Error(`Expected JSON content type, received: ${contentType ?? "unknown"}`);
  }

  if (!text.trim()) {
    throw new Error("Response body was empty");
  }

  return JSON.parse(text);
}

export function summariseRecords(records) {
  if (!Array.isArray(records)) {
    throw new Error("Expected AgendaLX response to be a JSON array");
  }

  const classifications = records.map((record) => classifyMusicRecord(record));

  return {
    totalRecords: records.length,
    musicClassifiableRecords: classifications.filter((item) => item.isMusic).length,
    musicMatches: classifications
      .map((classification, index) => ({
        index,
        id: records[index]?.id ?? null,
        title: records[index]?.title?.rendered ?? records[index]?.title ?? null,
        matchedValues: classification.matchedValues,
      }))
      .filter((item) => item.matchedValues.length > 0),
  };
}

export function selectRepresentativeSample(records, sampleSize = 10) {
  if (!Array.isArray(records)) {
    throw new Error("Expected records to be an array");
  }

  const musicRecords = records.filter((record) => classifyMusicRecord(record).isMusic);
  const nonMusicRecords = records.filter((record) => !classifyMusicRecord(record).isMusic);
  const selected = [...musicRecords.slice(0, Math.ceil(sampleSize / 2))];

  for (const record of nonMusicRecords) {
    if (selected.length >= sampleSize) {
      break;
    }
    selected.push(record);
  }

  for (const record of records) {
    if (selected.length >= sampleSize) {
      break;
    }
    if (!selected.includes(record)) {
      selected.push(record);
    }
  }

  return selected.slice(0, sampleSize);
}
