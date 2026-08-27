"use client";

import { useEffect, useRef, useState } from "react";
import {
  Map,
  Marker,
  NavigationControl,
  setWorkerUrl,
  type GeoJSONSource,
  type LngLatBoundsLike,
  type GeoJSONFeature,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import { hasMaterialConflict } from "@/ingestion/association/compare-facts.mjs";
import { buildNearTermLabel } from "@/ingestion/map/near-term.mjs";
import {
  VENUE_CLUSTER_SOURCE_ID,
  CLUSTER_CIRCLE_LAYER_ID,
  CLUSTER_HALO_LAYER_ID,
  CLUSTER_COUNT_LAYER_ID,
  CLUSTER_RADIUS,
  CLUSTER_MAX_ZOOM,
  NEAR_TERM_LABEL_MIN_ZOOM,
  GIG_COUNT_PROPERTY,
  buildVenueFeatureCollection,
  formatClusterTooltip,
} from "@/ingestion/map/cluster-geojson.mjs";

setWorkerUrl(
  "https://unpkg.com/maplibre-gl@6.5.0/dist/maplibre-gl-worker.mjs",
);

export type SearchCountry = "Portugal" | "Croatia" | "Spain" | "Germany" | "France";

type CountryMapView = {
  bounds: LngLatBoundsLike;
  center: [number, number];
  zoom: number;
};

export const COUNTRY_MAP_VIEWS: Record<SearchCountry, CountryMapView> = {
  Portugal: {
    bounds: [
      [-9.85, 36.8],
      [-5.95, 42.35],
    ],
    center: [-8.0, 39.6],
    zoom: 5.5,
  },
  Croatia: {
    bounds: [
      [13.05, 42.0],
      [19.8, 46.75],
    ],
    center: [16.35, 44.65],
    zoom: 5.4,
  },
  // BEATMAPPED-BARCELONA-FRONTEND-INTEGRATION-01 — unlike Portugal/
  // Croatia's own whole-country boxes, every current Spain venue is in
  // Barcelona (see ingestion/map/publication.mjs's buildSpainMarkers()
  // doc comment — Spain is Barcelona-only at proof time, not "all of
  // Spain" as a claim), so this bounding box is scoped to comfortably fit
  // all 31 real Barcelona venue markers (observed lat 41.363–41.430, lon
  // 2.112–2.203, see fixtures/map/barcelona-30-venue-population-01-live-run-proof.json)
  // with room to pan, rather than a country-wide box that would leave the
  // markers a tiny cluster in one corner. Widen this the same way Portugal's
  // own box already implicitly covers future non-Lisbon/Porto cities, once
  // a second Spanish city is populated.
  Spain: {
    bounds: [
      [2.04, 41.3],
      [2.27, 41.48],
    ],
    center: [2.159, 41.396],
    zoom: 12,
  },
  // BEATMAPPED-BERLIN-30-40-VENUE-COLLECTOR-REUSE-TRIAL-01 — Germany's own
  // bucket, following the exact same "scope the box to where the real
  // markers actually are" precedent as Spain above: every current Germany
  // venue is in Berlin (see ingestion/map/publication.mjs's
  // buildGermanyMarkers() doc comment), so this box comfortably fits the
  // real Berlin venue coordinates rather than a whole-country box that
  // would leave the markers a tiny cluster in one corner.
  Germany: {
    bounds: [
      [13.1, 52.38],
      [13.65, 52.62],
    ],
    center: [13.38, 52.5],
    zoom: 10.5,
  },
  // BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — France's own bucket,
  // following the exact same "scope the box to where the real markers
  // actually are" precedent as Spain/Germany above: every current France
  // venue is in Paris (see ingestion/map/publication.mjs's
  // buildFranceMarkers() doc comment), so this box comfortably fits the
  // real Paris venue coordinates (observed lat 48.832–48.900, lon
  // 2.279–2.394, see fixtures/map/paris-30-40-venue-population-01-live-run-proof.json)
  // rather than a whole-country box that would leave the markers a tiny
  // cluster in one corner.
  France: {
    bounds: [
      [2.2, 48.8],
      [2.47, 48.93],
    ],
    center: [2.336, 48.866],
    zoom: 11.3,
  },
};

export type ListingDateTime = {
  raw: string | null;
  date: string | null;
  iso: string | null;
  is_utc: boolean | null;
  tzid: string | null;
  certainty: string;
};

// BEATMAPPED-ENRICHMENT-PILOT-01 — one genre claim as attached by
// ingestion/map/attach-artist-genres.mjs (mirroring
// ingestion/artist/contract.mjs's own genre-claim shape). `confidence` is
// carried through for a future debug surface but never rendered as a
// false-precision score here.
export type GenreClaim = { family: string; tag: string | null; confidence?: string };

// A canonical Artist as attached to a display listing — never the full
// Artist record (no aliases/provenance here), just enough to render a
// name and its genre chips.
export type ArtistRef = { artist_id: string; canonical_name: string; genres: GenreClaim[] };

export type MapListing = {
  source_id: string;
  source_record_id: string;
  source_name: string | null;
  title: string | null;
  start: ListingDateTime;
  end: ListingDateTime;
  event_url: string | null;
  // Optional: absent/empty on a listing with no curated Event->Artist
  // link (see docs/ARTIST_ENRICHMENT.md) — never fabricated.
  artists?: ArtistRef[];
};

// A source reference inside a GROUP display listing — the same source
// facts as MapListing minus start/end, since a group carries one shared
// start/end (see GroupDisplayListing below).
export type DisplayListingSourceRef = {
  source_id: string;
  source_record_id: string;
  source_name: string | null;
  title: string | null;
  event_url: string | null;
};

export type FactComparisonField = { agree: boolean; values: [unknown, unknown] };

// Per-field comparison between two associated sources' own facts. Never a
// resolved/merged fact — see ingestion/association/compare-facts.mjs.
export type FactComparison = {
  sources: [string, string];
  title: FactComparisonField;
  date: FactComparisonField;
  start_time_raw: FactComparisonField;
  venue_text: FactComparisonField;
  price_text: FactComparisonField;
};

export type SingleDisplayListing = { kind: "SINGLE" } & MapListing;

// One real-world gig observed by more than one source (e.g. Hot Clube de
// Portugal's programme record and Capitólio's own venue-page record),
// evidence-backed associated for display only — see
// ingestion/association/hot-clube-capitolio.mjs and
// ingestion/map/group-associated-listings.mjs. Neither underlying source
// record is merged, discarded, or hidden: every source's own title and
// event_url remain independently available in `sources`.
export type GroupDisplayListing = {
  kind: "GROUP";
  display_title: string | null;
  start: ListingDateTime;
  end: ListingDateTime;
  sources: DisplayListingSourceRef[];
  fact_comparison: FactComparison;
  // See MapListing's own `artists` field doc comment above — resolved
  // per underlying source and deduplicated (ingestion/map/
  // attach-artist-genres.mjs), never fabricated for a GROUP with no link.
  artists?: ArtistRef[];
};

export type DisplayListing = SingleDisplayListing | GroupDisplayListing;

// `listings` (the raw, ungrouped, one-per-Observation array) is optional:
// the committed publication artifact (data/public/lisbon-porto-map.json,
// see ingestion/map/publication.mjs — BOTM-PUBLIC-MAP-LIVE-DATA-01) is
// deliberately MINIMAL and never includes it, since `display_listings`
// already carries everything a customer needs. Older/simpler proof
// payloads (e.g. fixtures/map/lisbon-map-proof.json) may still carry it;
// toDisplayListings() below falls back to it only when `display_listings`
// itself is absent.
export type MapMarker = {
  venue_id: string;
  canonical_name: string;
  latitude: number;
  longitude: number;
  address: string | null;
  listings?: MapListing[];
  display_listings?: DisplayListing[];
};

type DiscoveryMapProps = {
  country: SearchCountry;
  markers: MapMarker[];
};

// BOTM-MAP-DISCOVERY-UX-01: a more colourful OpenFreeMap style than the
// previous Positron (blue water, visible parks, a legible road hierarchy)
// while staying on MapLibre + OpenFreeMap — see the FINAL REPORT for the
// live reachability check performed before committing to this URL.
const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

// BEATMAPPED-MOBILE-VENUE-BOTTOM-SHEET-01 — mirrors the `@media
// (max-width: 700px)` breakpoint in app/globals.css that turns the venue
// panel into a bottom sheet. Kept as one shared constant so the JS
// pin-visibility offset below and the CSS layout switch can never drift
// apart.
const MOBILE_BREAKPOINT_PX = 700;

// The Bolt prototype's own starting point for how far to shift a selected
// pin upward (in map-container-height units) so it lands above the mobile
// bottom sheet rather than underneath it. Verified against a 42%-tall
// sheet (see .venue-panel's mobile height in app/globals.css): with the
// sheet covering the bottom 42% of the map, the remaining visible strip
// above it runs from 0% to 58% of the container height, and this factor
// centers the selected pin in that strip (0.5 - (1 - 0.42) / 2 = 0.21) —
// verified visually at 375/390/430px widths, not just carried over blindly.
const MOBILE_SELECTED_PIN_Y_OFFSET_FACTOR = 0.21;

function formatDateLabel(dt: ListingDateTime | null | undefined): string | null {
  if (!dt) return null;
  if (dt.iso) {
    const d = new Date(dt.iso);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
      });
    }
  }
  if (dt.date) {
    const d = new Date(dt.date + "T00:00:00Z");
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
      });
    }
  }
  if (dt.raw) return dt.raw;
  return null;
}

function formatTimeLabel(dt: ListingDateTime | null | undefined): string | null {
  if (!dt) return null;
  if (dt.iso) {
    const d = new Date(dt.iso);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
      }) + " UTC";
    }
  }
  return null;
}

// Note: there is deliberately no venue-level "View source" link here.
// Multiple listings can share one venue but each comes from its own
// source record with its own (possibly absent) event_url — a single link
// at the venue level would misleadingly imply one URL applies to all of
// them. Each listing (and, within a GROUP, each of its sources) renders
// its own link independently, only when its own event_url is genuinely
// non-null (see ingestion/hot-clube/observation-adapter.mjs,
// ingestion/capitolio/observation-adapter.mjs, and
// docs/sources/HOT_CLUBE.md's "Individual Event Permalinks").
//
// display_listings (BOTM-MULTISOURCE-LINKS-01) falls back to the raw
// per-Observation `listings`, each wrapped as its own SINGLE entry, for
// any marker that doesn't carry the newer grouped field — no data is
// lost by an older/simpler proof payload.
function toDisplayListings(marker: MapMarker): DisplayListing[] {
  if (marker.display_listings) return marker.display_listings;
  return (marker.listings ?? []).map((listing) => ({ kind: "SINGLE" as const, ...listing }));
}

// Builds the DOM element passed to `new Marker({ element: el })` for one
// INDIVIDUAL (unclustered) venue. This element is MapLibre's marker
// ROOT — see the BOTM-MAP-MARKER-ANCHOR-FIX-01 comment above
// `.botm-marker` in app/globals.css: it must never itself declare
// `position`/`transform`/`top`/`left`. Every visual/animated child added
// here (pulse, pin, hover tooltip, automatic near-term label) follows
// the same rule — positioning/animation stays on the CHILD element, never
// this root, exactly like the pre-existing pulse/pin children.
function createMarkerElement(marker: MapMarker, displayListings: DisplayListing[]): HTMLElement {
  const el = document.createElement("div");
  el.className = "botm-marker";
  el.dataset.venueId = marker.venue_id;

  const pulse = document.createElement("span");
  pulse.className = "botm-marker-pulse";
  el.appendChild(pulse);

  const pin = document.createElement("span");
  pin.className = "botm-marker-pin";
  pin.textContent = String(displayListings.length);
  el.appendChild(pin);

  // Venue hover tooltip (desktop enhancement only — pure CSS :hover, no
  // click required, disappears the instant the pointer leaves; touch
  // devices simply never trigger :hover, which is the correct, non-
  // "awkward simulated hover" behaviour the task brief asks for).
  const tooltip = document.createElement("span");
  tooltip.className = "botm-marker-tooltip";
  tooltip.textContent = marker.canonical_name;
  el.appendChild(tooltip);

  // Automatic near-term (today/tomorrow) gig label — only ever rendered
  // for a venue that actually has a qualifying display listing right now
  // (never guessed/fabricated), and only ever made visible once the map
  // is zoomed to NEAR_TERM_LABEL_MIN_ZOOM or closer (see the
  // `.discovery-map-inner.is-zoom-close` CSS rule and the zoomend
  // listener below that toggles it).
  const nearTerm = buildNearTermLabel(displayListings);
  if (nearTerm) {
    el.classList.add("has-near-term");
    const label = document.createElement("div");
    label.className = "botm-marker-label";

    const venueLine = document.createElement("span");
    venueLine.className = "botm-marker-label-venue";
    venueLine.textContent = marker.canonical_name;
    label.appendChild(venueLine);

    const summaryLine = document.createElement("span");
    summaryLine.className = "botm-marker-label-summary";
    summaryLine.textContent = nearTerm.venueLine;
    label.appendChild(summaryLine);

    el.appendChild(label);
  }

  return el;
}

// BEATMAPPED-ENRICHMENT-PILOT-01 — renders the Artist(s)/genre(s) a
// listing inherited (product decision #8), when a curated Event->Artist
// link exists. A listing with no link (artists absent/empty) renders
// nothing here — never a fabricated/guessed Artist. Genre confidence is
// deliberately never shown as a numeric score (product decision: "do not
// pretend confidence is scientifically precise").
function ArtistGenreChips({ artists }: { artists?: ArtistRef[] }) {
  if (!artists || artists.length === 0) return null;
  const genreLabels = Array.from(
    new Set(artists.flatMap((artist) => artist.genres.map((g) => g.tag ?? g.family))),
  );
  return (
    <div className="venue-panel-listing-artists">
      <p className="venue-panel-listing-artist-names">
        {artists.map((artist) => artist.canonical_name).join(", ")}
      </p>
      {genreLabels.length > 0 && (
        <ul className="venue-panel-listing-genre-chips">
          {genreLabels.map((label) => (
            <li key={label} className="venue-panel-listing-genre-chip">{label}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SingleListing({ listing }: { listing: SingleDisplayListing }) {
  const dateLabel = formatDateLabel(listing.start);
  const timeLabel = formatTimeLabel(listing.start);
  return (
    <div className="venue-panel-listing">
      <p className="venue-panel-listing-title">{listing.title ?? "(untitled listing)"}</p>
      <div className="venue-panel-listing-meta">
        {dateLabel && <span className="venue-panel-listing-date">{dateLabel}</span>}
        {timeLabel && <span className="venue-panel-listing-time">{timeLabel}</span>}
        {!dateLabel && !timeLabel && listing.start.raw && (
          <span className="venue-panel-listing-date">{listing.start.raw}</span>
        )}
      </div>
      <ArtistGenreChips artists={listing.artists} />
      <p className="venue-panel-listing-source">{listing.source_name ?? listing.source_id}</p>
      {listing.event_url && (
        <a href={listing.event_url} target="_blank" rel="noopener noreferrer" className="venue-panel-listing-link">
          View event →
        </a>
      )}
    </div>
  );
}

function GroupListing({ listing }: { listing: GroupDisplayListing }) {
  const dateLabel = formatDateLabel(listing.start);
  const timeLabel = formatTimeLabel(listing.start);
  return (
    <div className="venue-panel-listing venue-panel-listing-group">
      <p className="venue-panel-listing-title">{listing.display_title ?? "(untitled listing)"}</p>
      <div className="venue-panel-listing-meta">
        {dateLabel && <span className="venue-panel-listing-date">{dateLabel}</span>}
        {timeLabel && <span className="venue-panel-listing-time">{timeLabel}</span>}
        {!dateLabel && !timeLabel && listing.start.raw && (
          <span className="venue-panel-listing-date">{listing.start.raw}</span>
        )}
      </div>
      <ArtistGenreChips artists={listing.artists} />
      <p className="venue-panel-listing-sources-heading">Sources</p>
      <ul className="venue-panel-listing-sources">
        {listing.sources.map((source, i) => (
          <li key={i} className="venue-panel-listing-source-ref">
            <span className="venue-panel-listing-source">{source.source_name ?? source.source_id}</span>
            {source.event_url && (
              <a href={source.event_url} target="_blank" rel="noopener noreferrer" className="venue-panel-listing-link">
                View event →
              </a>
            )}
          </li>
        ))}
      </ul>
      {hasMaterialConflict(listing.fact_comparison) && (
        <p className="venue-panel-listing-sources-differ">Sources differ</p>
      )}
    </div>
  );
}

function VenuePanel({ marker, onClose }: { marker: MapMarker; onClose: () => void }) {
  const displayListings = toDisplayListings(marker);
  return (
    <div className="venue-panel" role="dialog" aria-label={marker.canonical_name}>
      {/* BEATMAPPED-MOBILE-VENUE-BOTTOM-SHEET-01 — purely visual affordance
          that this panel is a bottom sheet on mobile (see
          .venue-panel-handle in app/globals.css, hidden on desktop). No
          drag/swipe gesture is wired to it — closing stays via the button
          below, exactly as before. */}
      <span className="venue-panel-handle" aria-hidden="true" />
      <button className="venue-panel-close" onClick={onClose} aria-label="Close" type="button">×</button>
      <div className="venue-panel-header">
        <h3>{marker.canonical_name}</h3>
        {marker.address && <p className="venue-panel-address">{marker.address}</p>}
      </div>
      <p className="venue-panel-proof-badge">Proof data · source listings, not confirmed events</p>
      <p className="venue-panel-listings-heading">
        {displayListings.length} listing{displayListings.length === 1 ? "" : "s"}
      </p>
      <div className="venue-panel-listings">
        {displayListings.map((listing, i) =>
          listing.kind === "GROUP" ? (
            <GroupListing key={i} listing={listing} />
          ) : (
            <SingleListing key={i} listing={listing} />
          ),
        )}
      </div>
    </div>
  );
}

export function DiscoveryMap({ country, markers }: DiscoveryMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const initialCountryRef = useRef(country);
  // Snapshot of `markers` at mount time only, mirroring initialCountryRef
  // above — the cluster source is seeded with this once when the map
  // first loads; the separate `[markers]` effect below keeps it in sync
  // afterwards, so this ref deliberately never needs to be re-read.
  const initialMarkersRef = useRef(markers);
  const [activeVenue, setActiveVenue] = useState<MapMarker | null>(null);

  // Imperative state read by map event handlers below — kept current by
  // the [markers] effect further down (never mutated during render; refs
  // must only be written in effects/event handlers) so handlers bound
  // once, on map load, always see the latest `markers` prop without
  // needing to be re-bound. This mirrors how the DOM Marker elements
  // themselves are already managed imperatively/outside React's render.
  // `Map` in this file's scope is maplibre-gl's Map class (imported
  // above), so the built-in generic collection type must be referenced
  // explicitly as `globalThis.Map` here and below.
  const venueByIdRef = useRef<globalThis.Map<string, MapMarker>>(new globalThis.Map());

  // venue_id -> live DOM Marker, for individual (unclustered) venues only.
  // Clusters themselves are never DOM markers — see the circle/symbol
  // layers added in the mount effect below.
  const domMarkersRef = useRef<globalThis.Map<string, Marker>>(new globalThis.Map());

  const clusterTooltipRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    // Captured once, up front: domMarkersRef.current is one long-lived
    // Map instance for this effect's whole lifetime (never reassigned),
    // so reading it into a local here and using that local throughout —
    // including in this effect's cleanup — is equivalent to reading
    // `.current` each time, but keeps the lint rule that flags reading a
    // ref's `.current` inside a cleanup closure satisfied.
    const domMarkers = domMarkersRef.current;

    // BEATMAPPED-ENRICHMENT-PILOT-01 fix: which MapMarker object each
    // existing DOM marker was last built from — venue_id -> marker
    // reference. Needed because a filter change (Genre/Artist) can leave
    // a venue's venue_id in place while genuinely changing its
    // display_listings (and therefore its pin count and its click
    // handler's own venue-panel content) — without this, `domMarkers.has
    // (venueId)` alone would keep reusing a stale marker/click-handler
    // closure from before the filter changed, showing an out-of-date
    // panel for a venue whose visible pin count had already updated.
    const markerDataByVenueId = new globalThis.Map<string, MapMarker>();

    const initialView = COUNTRY_MAP_VIEWS[initialCountryRef.current];
    const map = new Map({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      center: initialView.center,
      zoom: initialView.zoom,
    });

    map.addControl(
      new NavigationControl({
        showCompass: true,
        showZoom: true,
      }),
      "top-right",
    );

    // Re-renders every currently-unclustered venue as a DOM Marker,
    // diffed against the previous set so existing markers (and their
    // click listeners/hover state) are left untouched. Bound to `render`
    // (the same event MapLibre's own official "HTML clusters" pattern
    // uses) — with at most a handful of venues this is cheap, and it is
    // the only way to reliably stay in sync with supercluster's own
    // zoom-dependent grouping, which `querySourceFeatures` reflects only
    // once the source's tiles for the current view have loaded.
    function syncUnclusteredMarkers() {
      if (!map.getSource(VENUE_CLUSTER_SOURCE_ID)) return;

      let rendered: GeoJSONFeature[];
      try {
        rendered = map.querySourceFeatures(VENUE_CLUSTER_SOURCE_ID, {
          filter: ["!", ["has", "point_count"]],
        });
      } catch {
        return; // source/tiles not ready yet
      }

      const currentIds = new Set<string>();
      for (const feature of rendered) {
        const venueId = feature.properties?.venue_id as string | undefined;
        if (!venueId || currentIds.has(venueId)) continue;
        currentIds.add(venueId);

        const marker = venueByIdRef.current.get(venueId);
        if (!marker) continue;

        // Skip only when this venue's DOM marker already reflects THIS
        // exact marker object — a genuinely new filter result (a new
        // array from filterMarkersByGenre/filterMarkersByArtistId, see
        // app/page.tsx) is a new object even when venue_id is unchanged,
        // so this still rebuilds when a filter narrows/widens which
        // display listings a persisting venue carries.
        if (domMarkers.has(venueId) && markerDataByVenueId.get(venueId) === marker) continue;

        const existingDomMarker = domMarkers.get(venueId);
        if (existingDomMarker) existingDomMarker.remove();

        const displayListings = toDisplayListings(marker);
        const el = createMarkerElement(marker, displayListings);
        el.addEventListener("click", () => {
          document.querySelectorAll(".botm-marker").forEach((m) => m.classList.remove("is-active"));
          el.classList.add("is-active");
          setActiveVenue(marker);

          // BEATMAPPED-MOBILE-VENUE-BOTTOM-SHEET-01 — on mobile the venue
          // panel becomes a bottom sheet covering the lower portion of the
          // map (see app/globals.css), so centering the pin on the whole
          // container would land it underneath the sheet. `offset` shifts
          // where the target center appears on screen relative to the
          // container's true center; a negative Y value moves it upward,
          // into the visible strip above the sheet. Desktop keeps the
          // existing plain-centered behaviour (no offset).
          const isMobile = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`).matches;
          const offset: [number, number] = isMobile
            ? [0, -map.getContainer().clientHeight * MOBILE_SELECTED_PIN_Y_OFFSET_FACTOR]
            : [0, 0];

          map.easeTo({
            center: [marker.longitude, marker.latitude],
            zoom: Math.max(map.getZoom(), 15),
            offset,
            duration: 800,
          });
        });

        const domMarker = new Marker({ element: el })
          .setLngLat([marker.longitude, marker.latitude])
          .addTo(map);
        domMarkers.set(venueId, domMarker);
        markerDataByVenueId.set(venueId, marker);
      }

      for (const [venueId, domMarker] of domMarkers) {
        if (!currentIds.has(venueId)) {
          domMarker.remove();
          domMarkers.delete(venueId);
          markerDataByVenueId.delete(venueId);
        }
      }
    }

    function hideClusterTooltip() {
      const tooltipEl = clusterTooltipRef.current;
      if (tooltipEl) tooltipEl.style.display = "none";
    }

    function showClusterTooltip(e: MapLayerMouseEvent) {
      const feature = e.features?.[0];
      const tooltipEl = clusterTooltipRef.current;
      if (!feature || !tooltipEl) return;
      const venueCount = feature.properties?.point_count;
      const gigCount = feature.properties?.[GIG_COUNT_PROPERTY];
      tooltipEl.textContent = formatClusterTooltip(venueCount, gigCount);
      tooltipEl.style.left = `${e.point.x}px`;
      tooltipEl.style.top = `${e.point.y}px`;
      tooltipEl.style.display = "block";
    }

    function updateZoomClass() {
      containerRef.current?.classList.toggle("is-zoom-close", map.getZoom() >= NEAR_TERM_LABEL_MIN_ZOOM);
    }

    map.once("load", () => {
      map.fitBounds(initialView.bounds, {
        padding: 42,
        duration: 0,
      });

      // MapLibre-native geographic clustering: one GeoJSON source of
      // venue points, clustered by supercluster under the hood.
      // clusterProperties sums each leaf's own `gig_count` (the number
      // of DISPLAY GIG LISTINGS at that venue — see
      // ingestion/map/cluster-geojson.mjs) into the cluster's own
      // `gig_count`, so a cluster's displayed number is the TOTAL gig
      // count across every venue it represents — never merely the
      // number of venues. supercluster's own built-in `point_count`
      // property gives the venue count for free, used only in the
      // cluster hover tooltip ("N venues · M gigs").
      map.addSource(VENUE_CLUSTER_SOURCE_ID, {
        type: "geojson",
        data: buildVenueFeatureCollection(initialMarkersRef.current) as GeoJSON.FeatureCollection,
        cluster: true,
        clusterRadius: CLUSTER_RADIUS,
        clusterMaxZoom: CLUSTER_MAX_ZOOM,
        clusterProperties: {
          [GIG_COUNT_PROPERTY]: ["+", ["get", GIG_COUNT_PROPERTY]],
        },
      });

      // A static (non-animated, deliberately calm) halo behind each
      // cluster circle, sized with it — gives clusters a "target" look
      // clearly distinct from individual venue pins without adding a
      // busy/noisy animation on top of an already-colourful base map.
      map.addLayer({
        id: CLUSTER_HALO_LAYER_ID,
        type: "circle",
        source: VENUE_CLUSTER_SOURCE_ID,
        filter: ["has", "point_count"],
        paint: {
          "circle-radius": ["step", ["get", GIG_COUNT_PROPERTY], 26, 20, 30, 60, 34, 120, 38],
          "circle-color": "#e8876e",
          "circle-opacity": 0.18,
        },
      });

      map.addLayer({
        id: CLUSTER_CIRCLE_LAYER_ID,
        type: "circle",
        source: VENUE_CLUSTER_SOURCE_ID,
        filter: ["has", "point_count"],
        paint: {
          "circle-radius": ["step", ["get", GIG_COUNT_PROPERTY], 18, 20, 22, 60, 25, 120, 28],
          "circle-color": "#e8876e",
          "circle-stroke-width": 3,
          "circle-stroke-color": "#fffefa",
        },
      });

      map.addLayer({
        id: CLUSTER_COUNT_LAYER_ID,
        type: "symbol",
        source: VENUE_CLUSTER_SOURCE_ID,
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", GIG_COUNT_PROPERTY],
          "text-font": ["Noto Sans Bold"],
          "text-size": 13,
        },
        paint: {
          "text-color": "#fffefa",
        },
      });

      // Cluster click: zoom smoothly to MapLibre/supercluster's own
      // expansion zoom for that cluster and let it separate naturally —
      // never a manually-computed zoom offset, never a venue panel.
      map.on("click", CLUSTER_CIRCLE_LAYER_ID, (e: MapLayerMouseEvent) => {
        const feature = map.queryRenderedFeatures(e.point, { layers: [CLUSTER_CIRCLE_LAYER_ID] })[0];
        const clusterId = feature?.properties?.cluster_id;
        if (clusterId === undefined || feature.geometry.type !== "Point") return;

        const source = map.getSource(VENUE_CLUSTER_SOURCE_ID) as GeoJSONSource;
        source
          .getClusterExpansionZoom(clusterId)
          .then((zoom) => {
            map.easeTo({
              center: feature.geometry.type === "Point" ? (feature.geometry.coordinates as [number, number]) : undefined,
              zoom,
              duration: 600,
            });
          })
          .catch(() => {
            // Expansion zoom lookup failed (e.g. stale cluster id after a
            // fast re-cluster) — no-op rather than a bad manual zoom guess.
          });
      });

      map.on("mouseenter", CLUSTER_CIRCLE_LAYER_ID, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mousemove", CLUSTER_CIRCLE_LAYER_ID, showClusterTooltip);
      map.on("mouseleave", CLUSTER_CIRCLE_LAYER_ID, () => {
        map.getCanvas().style.cursor = "";
        hideClusterTooltip();
      });

      map.on("zoomend", updateZoomClass);
      updateZoomClass();

      map.on("render", syncUnclusteredMarkers);
      syncUnclusteredMarkers();
    });

    const resizeObserver = new ResizeObserver(() => {
      map.resize();
    });
    resizeObserver.observe(containerRef.current);

    mapRef.current = map;

    return () => {
      resizeObserver.disconnect();
      for (const domMarker of domMarkers.values()) {
        domMarker.remove();
      }
      domMarkers.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    map.fitBounds(COUNTRY_MAP_VIEWS[country].bounds, {
      padding: 42,
      duration: 1000,
      essential: true,
    });
  }, [country]);

  // Keeps the clustered GeoJSON source in sync when the visible marker
  // set changes (e.g. a genre/date/price filter narrows `markers`) —
  // the underlying dataset itself never changes here, only what's
  // currently plotted. The mount effect's own `map.once("load", ...)`
  // seeds the source with whatever `markers` held at construction time;
  // this effect keeps it current afterwards.
  useEffect(() => {
    venueByIdRef.current = new globalThis.Map(markers.map((marker) => [marker.venue_id, marker]));

    const map = mapRef.current;
    if (!map) return;
    const source = map.getSource(VENUE_CLUSTER_SOURCE_ID) as GeoJSONSource | undefined;
    if (source) {
      source.setData(buildVenueFeatureCollection(markers) as GeoJSON.FeatureCollection);
    }
  }, [markers]);

  return (
    <div
      className="discovery-map"
      role="region"
      aria-label={`Interactive map showing ${country}`}
    >
      <div ref={containerRef} className="discovery-map-inner" />
      <div ref={clusterTooltipRef} className="botm-cluster-tooltip" aria-hidden="true" />
      {activeVenue && (
        <VenuePanel marker={activeVenue} onClose={() => {
          setActiveVenue(null);
          document.querySelectorAll(".botm-marker.is-active").forEach((m) => m.classList.remove("is-active"));
        }} />
      )}
    </div>
  );
}
