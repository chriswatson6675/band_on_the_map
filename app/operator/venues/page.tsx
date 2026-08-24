// VENUE-MANUAL-COORDINATES-DASHBOARD-01 — /operator/venues
//
// Server component: reads the CURRENT canonical estate directly (no
// client-side fetch, no hardcoded venue list) via
// ingestion/geocoding/venue-coordinate-dashboard.mjs, then hands a plain,
// already-serializable snapshot to the interactive client component.
// Writes never happen here — they go through
// app/api/operator/manual-coordinates/route.ts, which independently
// re-validates and re-gates every request server-side.

import { buildOperatorVenueDashboard } from "@/ingestion/geocoding/venue-coordinate-dashboard.mjs";
import { operatorWritesAllowed } from "@/ingestion/geocoding/operator-write-gate.mjs";
import { OperatorVenuesDashboard, type DashboardRow } from "@/components/OperatorVenuesDashboard";

export const metadata = {
  title: "Venue coordinates — Band on the Map operator",
};

// This page reads local repository files on every request (the live
// canonical estate) and must never be statically cached/prerendered.
export const dynamic = "force-dynamic";

function toRow(
  source: Record<string, unknown>,
  {
    dashboardStatus,
    editable,
    removable,
  }: { dashboardStatus: DashboardRow["dashboard_status"]; editable: boolean; removable: boolean },
): DashboardRow {
  const manual = source.manual as { latitude?: number; longitude?: number } | undefined;
  return {
    venue_id: String(source.venue_id ?? ""),
    canonical_name: String(source.canonical_name ?? ""),
    city: (source.city as string | null) ?? null,
    municipality: (source.municipality as string | null) ?? null,
    address: (source.address as string | null) ?? null,
    location_status: (source.location_status as string | null) ?? null,
    dashboard_status: dashboardStatus,
    waiting_listings: (source.waiting_listings as number | null | undefined) ?? null,
    latitude: (manual?.latitude ?? (source.latitude as number | null | undefined)) ?? null,
    longitude: (manual?.longitude ?? (source.longitude as number | null | undefined)) ?? null,
    evidence: Array.isArray(source.evidence)
      ? (source.evidence as { url?: string; kind?: string }[]).map((e) => ({ url: e.url ?? null, kind: e.kind ?? null }))
      : [],
    editable,
    removable,
  };
}

export default async function OperatorVenuesPage() {
  const dashboard = await buildOperatorVenueDashboard();
  const writesAllowed = operatorWritesAllowed();

  const rows: DashboardRow[] = [
    ...dashboard.outstanding.map((entry) =>
      toRow(entry as unknown as Record<string, unknown>, {
        dashboardStatus: "NEEDS_COORDINATES",
        editable: true,
        removable: false,
      }),
    ),
    ...dashboard.manuallyCompleted.map((venue) =>
      toRow(venue as unknown as Record<string, unknown>, {
        dashboardStatus: "MANUAL_SAVED",
        editable: true,
        removable: true,
      }),
    ),
    ...dashboard.alreadyMapEnabled.map((venue) =>
      toRow(venue as unknown as Record<string, unknown>, {
        dashboardStatus: (venue as { location_status: "CONFIRMED" | "GEOCODED" }).location_status,
        editable: false,
        removable: false,
      }),
    ),
  ];

  const cities = Array.from(
    new Set(rows.map((row) => row.city).filter((city): city is string => Boolean(city))),
  ).sort((a, b) => a.localeCompare(b));

  return (
    <OperatorVenuesDashboard
      rows={rows}
      totals={dashboard.totals}
      cities={cities}
      writesAllowed={writesAllowed}
    />
  );
}
