import { NextResponse } from "next/server";
import { z } from "zod";
import { sendBookingFollowUpEmail } from "@/lib/email/adapter";
import { loadState, saveState } from "@/lib/store";

export const runtime = "nodejs";

const Schema = z.object({
  jobId: z.string(),
});

/** One working email path: booking follow-up on the job's conversation. */
export async function POST(request: Request) {
  const { jobId } = Schema.parse(await request.json());
  let state = loadState();
  const job = state.jobs.find((j) => j.id === jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  const result = sendBookingFollowUpEmail(state, job);
  saveState(result.state);
  return NextResponse.json({
    ok: true,
    conversationId: result.conversationId,
    body: result.body,
  });
}

export async function GET() {
  return NextResponse.json({
    endpoint: "/api/email/followup",
    note: "Stub adapter — POST { jobId } to record a booking confirmation email on the conversation.",
  });
}
