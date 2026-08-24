// VENUE-MANUAL-COORDINATES-DASHBOARD-01 — the operator dashboard's only
// write endpoint. Server-side only (Next.js Route Handler; never runs in
// the browser bundle). Accepts exactly three client-submitted fields —
// venue_id, latitude, longitude (plus an optional note) — and NEVER a
// filesystem path of any kind: the canonical store path is always
// resolved internally by ingestion/geocoding/manual-coordinate-store.mjs
// from that module's own file location, never from request input, never
// from process.cwd().
//
// Every write first passes operatorWritesAllowed() (see
// ingestion/geocoding/operator-write-gate.mjs): a real Vercel deployment
// can never write, and a local production build requires the explicit
// BOTM_OPERATOR_MODE=1 opt-in. A denied write returns a safe 403 failure
// and NEVER pretends persistence succeeded.

import { NextRequest, NextResponse } from "next/server";
import { operatorWritesAllowed, operatorWriteDeniedReason } from "@/ingestion/geocoding/operator-write-gate.mjs";
import { saveManualCoordinate, removeManualCoordinate } from "@/ingestion/geocoding/manual-coordinate-store.mjs";
import { loadCombinedVenues } from "@/ingestion/geocoding/venue-coordinate-dashboard.mjs";

export const runtime = "nodejs";

function deniedResponse() {
  return NextResponse.json(
    {
      ok: false,
      error: "WRITE_DISABLED",
      detail: operatorWriteDeniedReason() ?? "Manual-coordinate writes are disabled in this environment.",
    },
    { status: 403 },
  );
}

export async function POST(request: NextRequest) {
  if (!operatorWritesAllowed()) {
    return deniedResponse();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
  }

  const { venue_id: venueId, latitude, longitude, note } = (body ?? {}) as Record<string, unknown>;

  if (typeof venueId !== "string" || venueId.trim() === "") {
    return NextResponse.json({ ok: false, error: "VENUE_ID_REQUIRED" }, { status: 400 });
  }
  if (typeof latitude !== "number" && typeof latitude !== "string") {
    return NextResponse.json({ ok: false, error: "INVALID_LATITUDE" }, { status: 400 });
  }
  if (typeof longitude !== "number" && typeof longitude !== "string") {
    return NextResponse.json({ ok: false, error: "INVALID_LONGITUDE" }, { status: 400 });
  }

  const venues = await loadCombinedVenues();
  const result = await saveManualCoordinate({
    venueId,
    latitude,
    longitude,
    note: typeof note === "string" ? note : undefined,
    venues,
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: 422 });
  }
  return NextResponse.json(result, { status: 200 });
}

export async function DELETE(request: NextRequest) {
  if (!operatorWritesAllowed()) {
    return deniedResponse();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
  }

  const { venue_id: venueId } = (body ?? {}) as Record<string, unknown>;
  if (typeof venueId !== "string" || venueId.trim() === "") {
    return NextResponse.json({ ok: false, error: "VENUE_ID_REQUIRED" }, { status: 400 });
  }

  const result = await removeManualCoordinate({ venueId });
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
