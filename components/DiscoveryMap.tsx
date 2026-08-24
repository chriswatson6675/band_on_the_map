"use client";

import { useEffect, useRef, useState } from "react";
import {
  Map,
  Marker,
  NavigationControl,
  setWorkerUrl,
  type LngLatBoundsLike,
} from "maplibre-gl";
import { hasMaterialConflict } from "@/ingestion/association/compare-facts.mjs";

setWorkerUrl(
  "https://unpkg.com/maplibre-gl@6.5.0/dist/maplibre-gl-worker.mjs",
);

export type SearchCountry = "Portugal" | "Croatia";

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
};

export type ListingDateTime = {
  raw: string | null;
  date: string | null;
  iso: string | null;
  is_utc: boolean | null;
  tzid: string | null;
  certainty: string;
};

export type MapListing = {
  source_id: string;
  source_record_id: string;
  source_name: string | null;
  title: string | null;
  start: ListingDateTime;
  end: ListingDateTime;
  event_url: string | null;
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

const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

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

function createMarkerElement(count: number): HTMLElement {
  const el = document.createElement("div");
  el.className = "botm-marker";

  const pulse = document.createElement("span");
  pulse.className = "botm-marker-pulse";
  el.appendChild(pulse);

  const pin = document.createElement("span");
  pin.className = "botm-marker-pin";
  pin.textContent = String(count);
  el.appendChild(pin);

  return el;
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
  const [activeVenue, setActiveVenue] = useState<MapMarker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

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

    map.once("load", () => {
      map.fitBounds(initialView.bounds, {
        padding: 42,
        duration: 0,
      });
    });

    const resizeObserver = new ResizeObserver(() => {
      map.resize();
    });
    resizeObserver.observe(containerRef.current);

    mapRef.current = map;

    return () => {
      resizeObserver.disconnect();
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

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const instances = markers.map((marker) => {
      const count = marker.display_listings?.length ?? marker.listings?.length ?? 0;
      const el = createMarkerElement(count);
      el.addEventListener("click", () => {
        const allMarkers = document.querySelectorAll(".botm-marker");
        allMarkers.forEach((m) => m.classList.remove("is-active"));
        el.classList.add("is-active");
        setActiveVenue(marker);
        map.easeTo({
          center: [marker.longitude, marker.latitude],
          zoom: Math.max(map.getZoom(), 15),
          duration: 800,
        });
      });

      return new Marker({ element: el })
        .setLngLat([marker.longitude, marker.latitude])
        .addTo(map);
    });

    return () => {
      for (const marker of instances) {
        marker.remove();
      }
    };
  }, [markers]);

  return (
    <div
      className="discovery-map"
      role="region"
      aria-label={`Interactive map showing ${country}`}
    >
      <div ref={containerRef} className="discovery-map-inner" />
      {activeVenue && (
        <VenuePanel marker={activeVenue} onClose={() => {
          setActiveVenue(null);
          document.querySelectorAll(".botm-marker.is-active").forEach((m) => m.classList.remove("is-active"));
        }} />
      )}
    </div>
  );
}
