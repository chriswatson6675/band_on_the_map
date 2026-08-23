"use client";

import { useEffect, useRef } from "react";
import {
  Map,
  Marker,
  NavigationControl,
  Popup,
  setWorkerUrl,
  type LngLatBoundsLike,
} from "maplibre-gl";

setWorkerUrl(
  new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString(),
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

/**
 * A single date/time as preserved by the Observation pipeline (see
 * ingestion/observation/contract.mjs). Rendered honestly — never
 * reinterpreted into a fabricated local time.
 */
export type ListingDateTime = {
  raw: string | null;
  date: string | null;
  iso: string | null;
  is_utc: boolean | null;
  tzid: string | null;
  certainty: string;
};

/**
 * One source listing at a canonical Venue marker. This is a proven
 * Observation, not a canonical Event — source_id/source_record_id are the
 * only identity carried, and there is no event_id of any kind. See
 * docs/OBSERVATION_PIPELINE.md and ingestion/map/projection.mjs.
 */
export type MapListing = {
  source_id: string;
  source_record_id: string;
  source_name: string | null;
  title: string | null;
  start: ListingDateTime;
  end: ListingDateTime;
  event_url: string | null;
};

/** One canonical, map-eligible Venue and every listing resolved to it. */
export type MapMarker = {
  venue_id: string;
  canonical_name: string;
  latitude: number;
  longitude: number;
  address: string | null;
  listings: MapListing[];
};

type DiscoveryMapProps = {
  country: SearchCountry;
  markers: MapMarker[];
};

const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

/**
 * Render one date/time honestly: a confirmed UTC instant is shown as
 * such (labelled UTC, never silently reinterpreted into the visitor's
 * local time); anything less certain falls back to the source's own raw
 * text rather than a fabricated value. Returns null when nothing usable
 * is available.
 */
function formatDateTime(dt: ListingDateTime | null | undefined): string | null {
  if (!dt) return null;
  if (dt.certainty === "UTC_INSTANT" && dt.iso) {
    return `${dt.iso.slice(0, 10)} · ${dt.iso.slice(11, 16)} UTC`;
  }
  if (dt.raw) return dt.raw;
  if (dt.date) return dt.date;
  return null;
}

function formatWhen(start: ListingDateTime, end: ListingDateTime): string {
  const startText = formatDateTime(start);
  if (!startText) return "Date not confirmed";
  if (end?.certainty === "UTC_INSTANT" && end.iso && start?.certainty === "UTC_INSTANT") {
    return `${startText} – ${end.iso.slice(11, 16)} UTC`;
  }
  return startText;
}

/**
 * Build the marker popup's DOM content directly via createElement/
 * textContent — no innerHTML, no injected source HTML/descriptions. Only
 * the small set of factual fields already proven by the Observation +
 * Venue-resolution pipeline are shown.
 */
function buildPopupContent(marker: MapMarker): HTMLElement {
  const container = document.createElement("div");
  container.className = "venue-popup";

  const heading = document.createElement("h3");
  heading.textContent = marker.canonical_name;
  container.appendChild(heading);

  if (marker.address) {
    const address = document.createElement("p");
    address.className = "venue-popup-address";
    address.textContent = marker.address;
    container.appendChild(address);
  }

  const note = document.createElement("p");
  note.className = "venue-popup-note";
  note.textContent = "Retained development proof — not live availability";
  container.appendChild(note);

  const list = document.createElement("ul");
  list.className = "venue-popup-listings";

  for (const listing of marker.listings) {
    const item = document.createElement("li");

    const title = document.createElement("p");
    title.className = "venue-popup-listing-title";
    title.textContent = listing.title ?? "(untitled listing)";
    item.appendChild(title);

    const meta = document.createElement("p");
    meta.className = "venue-popup-listing-meta";
    meta.textContent = `${listing.source_name ?? listing.source_id} · ${formatWhen(listing.start, listing.end)}`;
    item.appendChild(meta);

    if (listing.event_url) {
      const link = document.createElement("a");
      link.href = listing.event_url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Source page";
      item.appendChild(link);
    }

    list.appendChild(item);
  }

  container.appendChild(list);
  return container;
}

export function DiscoveryMap({ country, markers }: DiscoveryMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const initialCountryRef = useRef(country);

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

  // Render exactly the markers this component was handed (already
  // country-scoped by the caller via getMarkersForCountry — see
  // app/page.tsx and ingestion/map/projection.mjs). Markers are plain DOM
  // overlays and do not need to wait for the style/tiles to finish
  // loading — waiting on a one-shot "load" event here would race with
  // React's development-mode double-invoked effects (the event can fire,
  // or the map can be torn down and recreated, before a late listener
  // attaches) and silently leave the map pin-less. The effect's own
  // cleanup removes every marker it added, so re-running on a `markers`
  // change (including Strict Mode's mount/cleanup/mount cycle) never
  // leaves a stale or duplicated pin behind.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const instances = markers.map((marker) => {
      const popup = new Popup({ offset: 18, maxWidth: "280px" }).setDOMContent(
        buildPopupContent(marker),
      );
      return new Marker({ color: "#e8876e" })
        .setLngLat([marker.longitude, marker.latitude])
        .setPopup(popup)
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
      ref={containerRef}
      className="discovery-map"
      role="region"
      aria-label={`Interactive map showing ${country}`}
    />
  );
}
