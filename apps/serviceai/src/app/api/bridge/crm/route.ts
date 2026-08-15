import { NextResponse } from "next/server";
import { BRIDGE_PROVIDER_NOTES } from "@/lib/bridge/crm";
import { loadState } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  const state = loadState();
  return NextResponse.json({
    adapter: "in_app_stub",
    notes: BRIDGE_PROVIDER_NOTES,
    records: state.crmRecords,
  });
}
