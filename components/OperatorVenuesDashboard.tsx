"use client";

// VENUE-MANUAL-COORDINATES-DASHBOARD-01 — the interactive part of
// /operator/venues. Deliberately small and practical: no design system,
// reuses this project's existing palette/typography tokens (see
// app/globals.css's .operator-* rules, which sit alongside the existing
// site styling rather than replacing it).
//
// This component NEVER decides whether a write is allowed — that is
// enforced server-side by app/api/operator/manual-coordinates/route.ts on
// every request, regardless of what this UI shows. `writesAllowed` here
// is purely an informational banner.

import { useMemo, useState } from "react";

export type DashboardStatus = "NEEDS_COORDINATES" | "MANUAL_SAVED" | "CONFIRMED" | "GEOCODED";

export type DashboardRow = {
  venue_id: string;
  canonical_name: string;
  city: string | null;
  municipality: string | null;
  address: string | null;
  location_status: string | null;
  dashboard_status: DashboardStatus;
  waiting_listings: number | null;
  latitude: number | null;
  longitude: number | null;
  evidence: { url: string | null; kind: string | null }[];
  editable: boolean;
  removable: boolean;
};

type Totals = { needCoordinates: number; manuallyCompleted: number; alreadyMapEnabled: number };

type Props = {
  rows: DashboardRow[];
  totals: Totals;
  cities: string[];
  writesAllowed: boolean;
};

const STATUS_LABEL: Record<DashboardStatus, string> = {
  NEEDS_COORDINATES: "NEEDS COORDINATES",
  MANUAL_SAVED: "MANUAL COORDINATES SAVED",
  CONFIRMED: "CONFIRMED",
  GEOCODED: "GEOCODED",
};

type StatusFilter = "NEEDS" | "COMPLETED" | "ALL";

function parseCoordinateInput(value: string): number {
  return value.trim() === "" ? NaN : Number(value);
}

function isValidLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

function isValidLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

// Not part of the schema/global validation contract (see
// docs/OPERATOR_VENUE_COORDINATES.md) — a plausibility hint only.
const PORTUGAL_BOUNDS = { minLat: 36.5, maxLat: 42.5, minLon: -10.0, maxLon: -5.5 };
function looksOutsidePortugal(lat: number, lon: number): boolean {
  return lat < PORTUGAL_BOUNDS.minLat || lat > PORTUGAL_BOUNDS.maxLat || lon < PORTUGAL_BOUNDS.minLon || lon > PORTUGAL_BOUNDS.maxLon;
}

function RowEditor({ row, onSaved, onRemoved, writesAllowed }: {
  row: DashboardRow;
  onSaved: (venueId: string, latitude: number, longitude: number) => void;
  onRemoved: (venueId: string) => void;
  writesAllowed: boolean;
}) {
  const [latText, setLatText] = useState(row.latitude != null ? String(row.latitude) : "");
  const [lonText, setLonText] = useState(row.longitude != null ? String(row.longitude) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const latitude = parseCoordinateInput(latText);
  const longitude = parseCoordinateInput(lonText);
  const latValid = isValidLatitude(latitude);
  const lonValid = isValidLongitude(longitude);
  const canSave = latValid && lonValid && !busy;

  async function handleSave() {
    setError(null);
    if (!latValid || !lonValid) {
      setError("Enter a latitude between -90 and 90 and a longitude between -180 and 180.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/operator/manual-coordinates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venue_id: row.venue_id, latitude, longitude }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.detail ?? data.error ?? "Save failed.");
        return;
      }
      onSaved(row.venue_id, latitude, longitude);
    } catch {
      setError("Save failed: network error.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/operator/manual-coordinates", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venue_id: row.venue_id }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.detail ?? data.error ?? "Remove failed.");
        return;
      }
      onRemoved(row.venue_id);
    } catch {
      setError("Remove failed: network error.");
    } finally {
      setBusy(false);
    }
  }

  if (!row.editable) {
    return (
      <span className="op-readonly-coords">
        {row.latitude != null && row.longitude != null ? `${row.latitude}, ${row.longitude}` : "—"}
      </span>
    );
  }

  return (
    <div className="op-editor">
      <div className="op-editor-inputs">
        <input
          type="text"
          inputMode="decimal"
          aria-label={`Latitude for ${row.canonical_name}`}
          placeholder="Latitude"
          value={latText}
          onChange={(e) => setLatText(e.target.value)}
        />
        <input
          type="text"
          inputMode="decimal"
          aria-label={`Longitude for ${row.canonical_name}`}
          placeholder="Longitude"
          value={lonText}
          onChange={(e) => setLonText(e.target.value)}
        />
      </div>
      <div className="op-editor-actions">
        <button type="button" disabled={!canSave || !writesAllowed} onClick={handleSave}>
          {busy ? "Saving…" : "Save coordinates"}
        </button>
        {row.removable && (
          <button type="button" className="op-remove" disabled={busy || !writesAllowed} onClick={handleRemove}>
            Remove manual coordinates
          </button>
        )}
        <button
          type="button"
          className="op-cancel"
          disabled={busy}
          onClick={() => {
            setLatText(row.latitude != null ? String(row.latitude) : "");
            setLonText(row.longitude != null ? String(row.longitude) : "");
            setError(null);
          }}
        >
          Cancel
        </button>
      </div>
      {latText.trim() !== "" && lonText.trim() !== "" && latValid && lonValid && looksOutsidePortugal(latitude, longitude) && (
        <p className="op-warning">This coordinate looks well outside Portugal — double-check before saving.</p>
      )}
      {error && <p className="op-error">{error}</p>}
      {!writesAllowed && <p className="op-warning">Writes are disabled in this environment.</p>}
    </div>
  );
}

export function OperatorVenuesDashboard({ rows: initialRows, totals: initialTotals, cities, writesAllowed }: Props) {
  const [rows, setRows] = useState(initialRows);
  const [totals, setTotals] = useState(initialTotals);
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("NEEDS");

  function handleSaved(venueId: string, latitude: number, longitude: number) {
    // Deliberately NOT nested inside setRows' own updater: React Strict
    // Mode (on by default in `next dev`) double-invokes a functional
    // setState updater to detect impurity, so a setState call NESTED
    // inside another updater fires twice per save — computed here, as a
    // plain top-level statement, instead.
    const wasOutstanding = rows.find((r) => r.venue_id === venueId)?.dashboard_status === "NEEDS_COORDINATES";

    setRows((prev) =>
      prev.map((r) =>
        r.venue_id === venueId
          ? { ...r, latitude, longitude, dashboard_status: "MANUAL_SAVED" as const, editable: true, removable: true }
          : r,
      ),
    );
    if (wasOutstanding) {
      setTotals((t) => ({ ...t, needCoordinates: t.needCoordinates - 1, manuallyCompleted: t.manuallyCompleted + 1 }));
    }
  }

  function handleRemoved(venueId: string) {
    setRows((prev) => {
      const next = prev.map((r) =>
        r.venue_id === venueId
          ? { ...r, latitude: null, longitude: null, dashboard_status: "NEEDS_COORDINATES" as const, editable: true, removable: false }
          : r,
      );
      return next;
    });
    setTotals((t) => ({ ...t, needCoordinates: t.needCoordinates + 1, manuallyCompleted: t.manuallyCompleted - 1 }));
  }

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter === "NEEDS" && row.dashboard_status !== "NEEDS_COORDINATES") return false;
      if (statusFilter === "COMPLETED" && row.dashboard_status !== "MANUAL_SAVED") return false;
      if (cityFilter !== "All" && row.city !== cityFilter) return false;
      if (term === "") return true;
      const haystack = `${row.canonical_name} ${row.city ?? ""} ${row.address ?? ""}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [rows, search, cityFilter, statusFilter]);

  return (
    <main className="operator-shell">
      <div className="operator-wrap">
        <header className="operator-header">
          <h1>Venue coordinates</h1>
          <p className="operator-summary">
            <strong>{totals.needCoordinates}</strong> need coordinates ·{" "}
            <strong>{totals.manuallyCompleted}</strong> manually completed ·{" "}
            <strong>{totals.alreadyMapEnabled}</strong> already map-enabled
          </p>
          {!writesAllowed && (
            <p className="op-warning op-banner">
              This environment has manual-coordinate writes disabled (production/Vercel fail-closed rule). You can
              browse the queue but Save/Remove will be rejected by the server.
            </p>
          )}
        </header>

        <div className="operator-controls">
          <input
            type="search"
            className="operator-search"
            placeholder="Search venues…"
            aria-label="Search venues"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select aria-label="Filter by city" value={cityFilter} onChange={(e) => setCityFilter(e.target.value)}>
            <option>All</option>
            {cities.map((city) => (
              <option key={city}>{city}</option>
            ))}
          </select>
          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            <option value="NEEDS">Needs coordinates</option>
            <option value="COMPLETED">Manually completed</option>
            <option value="ALL">All</option>
          </select>
        </div>

        <div className="operator-table-wrap">
          <table className="operator-table">
            <thead>
              <tr>
                <th>Venue</th>
                <th>City</th>
                <th>Address</th>
                <th>Waiting listings</th>
                <th>Status</th>
                <th>Coordinates</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.venue_id}>
                  <td>{row.canonical_name}</td>
                  <td>{row.city ?? row.municipality ?? "—"}</td>
                  <td className="operator-address">{row.address ?? "—"}</td>
                  <td>{row.waiting_listings != null ? row.waiting_listings : "—"}</td>
                  <td>
                    <span className={`op-status op-status-${row.dashboard_status.toLowerCase()}`}>
                      {STATUS_LABEL[row.dashboard_status]}
                    </span>
                  </td>
                  <td>
                    <RowEditor row={row} onSaved={handleSaved} onRemoved={handleRemoved} writesAllowed={writesAllowed} />
                  </td>
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="operator-empty">
                    No venues match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
