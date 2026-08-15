import { NextResponse } from "next/server";
import { getDemoNow } from "@/lib/booking/engine";
import { createSeedState } from "@/lib/seed";
import { loadState, resetState, saveState } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  const state = loadState();
  return NextResponse.json({
    shop: state.shop,
    demoNowIso: getDemoNow().toISOString(),
    customers: state.customers,
    technicians: state.technicians,
    openSlotCount: state.slots.filter((s) => !s.bookedJobId).length,
    jobCount: state.jobs.length,
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { action?: string };
  if (body.action === "reset") {
    const state = resetState();
    return NextResponse.json({ ok: true, shop: state.shop.name, jobs: 0 });
  }
  // default: ensure seeded
  let state = loadState();
  if (!state.shop) {
    state = createSeedState();
    saveState(state);
  }
  return NextResponse.json({ ok: true, shop: state.shop.name });
}
