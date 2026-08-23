"use client";

import { useEffect, useRef } from "react";
import {
  Map,
  NavigationControl,
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

type DiscoveryMapProps = {
  country: SearchCountry;
};

const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

export function DiscoveryMap({ country }: DiscoveryMapProps) {
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

  return (
    <div
      ref={containerRef}
      className="discovery-map"
      role="region"
      aria-label={`Interactive map showing ${country}`}
    />
  );
}
