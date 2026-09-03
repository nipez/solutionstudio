import { NextResponse } from "next/server";
import { loadState } from "@/lib/store";

export const runtime = "nodejs";

/** @deprecated Prefer /api/command — kept for the first-slice office view. */
export async function GET() {
  const state = loadState();
  return NextResponse.json({
    jobs: state.jobs,
    calls: state.calls,
    conversations: state.conversations,
    crmRecords: state.crmRecords,
  });
}
