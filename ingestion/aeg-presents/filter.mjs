// BEATMAPPED-LONDON-SECOND-LIVE-TRANCHE-01 — the AEG-hosted platform's own
// events index exposes no genre/category field anywhere (confirmed: no
// schema.org Event/MusicEvent JSON-LD, no category badge on the list
// card, no category in the individual detail page's own JSON-LD either —
// see research/source-investigations/london-t2-eventim-apollo-03/
// evidence/full-listing-review.json). Real venues on this platform
// (Eventim Apollo, formerly Hammersmith Apollo) genuinely mix concerts
// with stand-up comedy, author talks, and podcast live shows — unlike
// Jamboree (ingestion/jamboree/filter.mjs), there is no source-exposed
// field to filter on deterministically. Per docs/SOURCE_INVESTIGATION_
// POLICY.md and this package's own music-gate instructions ("This
// package may use research judgement to determine source configuration,
// but runtime filtering must remain deterministic"), every real title on
// the venue's full current listing was individually reviewed by hand
// (full-listing-review.json) and classified include/exclude with a cited
// reason. The runtime check below is a plain Set membership test — no
// inference of any kind ever runs in production.
//
// Known limitation (documented, not hidden): this is a curated SNAPSHOT.
// A genuinely new music act not yet seen in this list is conservatively
// EXCLUDED until a future maintenance pass reviews and adds it — an
// accepted false-negative bias, matching this project's stated
// preference for under- rather than over-inclusion (task section 24).

// Individually confirmed as genuine live-music performances — see
// research/source-investigations/london-t2-eventim-apollo-03/evidence/
// full-listing-review.json for the full 82-title review and per-title
// exclusion reasons.
const MUSIC_GATE_INCLUDED_TITLES = {
  "eventim-apollo-london": new Set([
    "My Hero Academia in Concert", "Judas Priest", "Megan Moroney", "Ella Mai",
    "Sonic Live in Concert", "Dungeons & Dragons: Honour Among Thieves in Concert",
    "Marillion", "Europe", "Ólafur Arnalds", "Amon Amarth", "Georges Wassouf",
    "Avatar: The Last Airbender In Concert", "Alison Moyet", "Lake Street Dive",
    "Jeff Wayne’s Musical Version of The War of The Worlds", "Hocus Pocus in Concert",
    "Jim Henson's Labyrinth: In Concert", "The Witcher in Concert",
    "The Kid LAROI - A Perfect World Tour", "The Jacksons", "The Fray", "MUNA",
    "Drake Milligan", "Levellers - LTL35", "Deep Purple", "José González",
    "Disney’s The Muppet Christmas Carol in Concert", "The Holiday in Concert",
    "Hermanos Gutiérrez", "Love Actually Live in Concert - Film with Orchestra",
    "Bleachers", "Barenaked Ladies",
    "RESIDENT EVIL 30th Anniversary Concerts - Symphony of Legacy -", "Elmiene",
    "Sleepless in Seattle in Concert", "Sex Pistols feat. Frank Carter",
    "Metaphor: ReFantazio Orchestra Concert", "The Legend of Korra in Concert",
    "Donny Osmond", "Twilight: New Moon in Concert",
    "Marvel Studios' Infinity Saga Concert Experience", "DMA'S",
    "Outlander in Concert", "Julia Jacklin", "Saxon", "SIENNA SPIRO",
    "The Fratellis", "Ricchi e Poveri (60th Anniversary)", "Gabrielle",
    "Brandi Carlile", "NieR:Orchestra Concert 12026 [YoRHa]", "Passenger", "Il Volo",
  ]),
};

/**
 * Filter Observations built by ingestion/aeg-presents/observation-
 * adapter.mjs down to the source's own curated, evidenced music-relevant
 * title set. `sourceId` with no configured list keeps nothing (fail
 * closed — never silently publish an un-reviewed AEG-platform venue).
 */
export function filterAegPresentsMusicRecords(sourceId, observations) {
  const included = MUSIC_GATE_INCLUDED_TITLES[sourceId];
  if (!included || included.size === 0) return [];
  return (observations ?? []).filter((observation) => included.has(observation.title));
}

export { MUSIC_GATE_INCLUDED_TITLES };
