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

function buildPopupContent(marker: MapMarker): HTMLElement {
  const container = document.createElement("div");
  container.className = "venue-popup";

  const header = document.createElement("div");
  header.className = "venue-popup-header";

  const heading = document.createElement("h3");
  heading.textContent = marker.canonical_name;
  header.appendChild(heading);

  if (marker.address) {
    const address = document.createElement("p");
    address.className = "venue-popup-address";
    address.textContent = marker.address;
    header.appendChild(address);
  }

  container.appendChild(header);

  const proofBadge = document.createElement("p");
  proofBadge.className = "venue-popup-proof-badge";
  proofBadge.textContent = "Proof data · source listings, not confirmed events";
  container.appendChild(proofBadge);

  const listHeading = document.createElement("p");
  listHeading.className = "venue-popup-listings-heading";
  listHeading.textContent = `${marker.listings.length} source listing${marker.listings.length === 1 ? "" : "s"}`;
  container.appendChild(listHeading);

  const list = document.createElement("div");
  list.className = "venue-popup-listings";

  for (const listing of marker.listings) {
    const item = document.createElement("div");
    item.className = "venue-popup-listing";

    const title = document.createElement("p");
    title.className = "venue-popup-listing-title";
    title.textContent = listing.title ?? "(untitled listing)";
    item.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "venue-popup-listing-meta";

    const dateLabel = formatDateLabel(listing.start);
    const timeLabel = formatTimeLabel(listing.start);
    if (dateLabel) {
      const dateEl = document.createElement("span");
      dateEl.className = "venue-popup-listing-date";
      dateEl.textContent = dateLabel;
      meta.appendChild(dateEl);
    }
    if (timeLabel) {
      const timeEl = document.createElement("span");
      timeEl.className = "venue-popup-listing-time";
      timeEl.textContent = timeLabel;
      meta.appendChild(timeEl);
    }
    if (!dateLabel && !timeLabel && listing.start.raw) {
      const rawEl = document.createElement("span");
      rawEl.className = "venue-popup-listing-date";
      rawEl.textContent = listing.start.raw;
      meta.appendChild(rawEl);
    }
    if (meta.children.length > 0) {
      item.appendChild(meta);
    }

    const sourceEl = document.createElement("p");
    sourceEl.className = "venue-popup-listing-source";
    sourceEl.textContent = listing.source_name ?? listing.source_id;
    item.appendChild(sourceEl);

    if (listing.event_url) {
      const link = document.createElement("a");
      link.href = listing.event_url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.className = "venue-popup-listing-link";
      link.textContent = "View source page";
      item.appendChild(link);
    }

    list.appendChild(item);
  }

  container.appendChild(list);

  const stopMap = (e: Event) => e.stopImmediatePropagation();
  for (const evt of ["wheel", "touchstart", "touchmove", "mousedown", "dblclick"]) {
    container.addEventListener(evt, stopMap, { capture: true, passive: true });
  }

  return container;
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

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const instances = markers.map((marker) => {
      const popup = new Popup({
        offset: 34,
        maxWidth: "320px",
        closeButton: true,
        closeOnClick: true,
        className: "botm-popup",
      }).setDOMContent(buildPopupContent(marker));

      const el = createMarkerElement();
      el.addEventListener("click", () => {
        const allMarkers = document.querySelectorAll(".botm-marker");
        allMarkers.forEach((m) => m.classList.remove("is-active"));
        el.classList.add("is-active");
      });

      return new Marker({ element: el })
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
