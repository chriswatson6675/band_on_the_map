"use client";

import { useEffect, useRef, useState } from "react";
import {
  Map,
  Marker,
  NavigationControl,
  setWorkerUrl,
  type LngLatBoundsLike,
} from "maplibre-gl";

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

function createMarkerElement(): HTMLElement {
  const el = document.createElement("div");
  el.className = "botm-marker";

  const pulse = document.createElement("span");
  pulse.className = "botm-marker-pulse";
  el.appendChild(pulse);

  const pin = document.createElement("span");
  pin.className = "botm-marker-pin";
  el.appendChild(pin);

  return el;
}

// Note: there is deliberately no venue-level "View source" link here.
// Six listings can share one venue but each comes from its own source
// record with its own (possibly absent) event_url — a single link at the
// venue level would misleadingly imply one URL applies to all of them.
// Each listing renders its own link independently, only when its own
// event_url is genuinely non-null (see
// ingestion/hot-clube/observation-adapter.mjs and
// docs/sources/HOT_CLUBE.md's "Individual Event Permalinks").
function VenuePanel({ marker, onClose }: { marker: MapMarker; onClose: () => void }) {
  return (
    <div className="venue-panel" role="dialog" aria-label={marker.canonical_name}>
      <button className="venue-panel-close" onClick={onClose} aria-label="Close" type="button">×</button>
      <div className="venue-panel-header">
        <h3>{marker.canonical_name}</h3>
        {marker.address && <p className="venue-panel-address">{marker.address}</p>}
      </div>
      <p className="venue-panel-proof-badge">Proof data · source listings, not confirmed events</p>
      <p className="venue-panel-listings-heading">
        {marker.listings.length} source listing{marker.listings.length === 1 ? "" : "s"}
      </p>
      <div className="venue-panel-listings">
        {marker.listings.map((listing, i) => {
          const dateLabel = formatDateLabel(listing.start);
          const timeLabel = formatTimeLabel(listing.start);
          return (
            <div className="venue-panel-listing" key={i}>
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
                <a
                  href={listing.event_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="venue-panel-listing-link"
                >
                  View event →
                </a>
              )}
            </div>
          );
        })}
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
      const el = createMarkerElement();
      el.addEventListener("click", () => {
        const allMarkers = document.querySelectorAll(".botm-marker");
        allMarkers.forEach((m) => m.classList.remove("is-active"));
        el.classList.add("is-active");
        setActiveVenue(marker);
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
