import { NextResponse } from "next/server";
import { loadState } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  const state = loadState();
  return NextResponse.json({
    jobs: state.jobs,
    calls: state.calls,
  });
}
