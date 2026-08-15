import { NextResponse } from "next/server";
import { z } from "zod";
import {
  applyBooking,
  applyEscalation,
  applyNeedsFollowUp,
  evaluateCall,
  getDemoNow,
  normalizePhone,
} from "@/lib/booking/engine";
import { appendTranscript, loadState, saveState, startCall } from "@/lib/store";

export const runtime = "nodejs";

const StartSchema = z.object({
  fromPhone: z.string().min(7),
  calledAtIso: z.string().optional(),
});

const EvaluateSchema = z.object({
  callId: z.string(),
  fromPhone: z.string().min(7),
  calledAtIso: z.string().optional(),
  problemSummary: z.string().min(3),
  jobType: z.string().min(2),
  urgency: z.enum(["emergency", "same_day", "routine"]),
  newCallerName: z.string().optional(),
  newCallerAddress: z.string().optional(),
  requestHuman: z.boolean().optional(),
});

const BookSchema = z.object({
  callId: z.string(),
  slotId: z.string(),
  fromPhone: z.string().min(7),
  calledAtIso: z.string().optional(),
  problemSummary: z.string().min(3),
  jobType: z.string().min(2),
  urgency: z.enum(["emergency", "same_day", "routine"]),
  newCallerName: z.string().optional(),
  newCallerAddress: z.string().optional(),
});

const EscalateSchema = z.object({
  callId: z.string(),
  fromPhone: z.string().min(7),
  calledAtIso: z.string().optional(),
  problemSummary: z.string().min(3),
  jobType: z.string().min(2),
  urgency: z.enum(["emergency", "same_day", "routine"]),
  reason: z.string().min(3),
  newCallerName: z.string().optional(),
  newCallerAddress: z.string().optional(),
  requestHuman: z.boolean().optional(),
  asFollowUp: z.boolean().optional(),
});

export async function POST(request: Request) {
  const url = new URL(request.url);
  const step = url.searchParams.get("step") ?? "start";
  const body = await request.json();

  if (step === "start") {
    const input = StartSchema.parse(body);
    const calledAtIso = input.calledAtIso ?? getDemoNow().toISOString();
    let state = loadState();
    const started = startCall(
      state,
      normalizePhone(input.fromPhone),
      "sim",
      calledAtIso,
    );
    state = appendTranscript(
      started.state,
      started.call.id,
      "assistant",
      "Thanks for calling Summit Comfort HVAC. You've reached our after-hours line.",
    );
    saveState(state);
    return NextResponse.json({ call: started.call, calledAtIso });
  }

  if (step === "evaluate") {
    const input = EvaluateSchema.parse(body);
    const calledAtIso = input.calledAtIso ?? getDemoNow().toISOString();
    let state = loadState();
    state = appendTranscript(
      state,
      input.callId,
      "caller",
      `${input.jobType}: ${input.problemSummary}`,
    );
    const decision = evaluateCall(state, {
      fromPhone: input.fromPhone,
      calledAtIso,
      problemSummary: input.problemSummary,
      jobType: input.jobType,
      urgency: input.urgency,
      newCallerName: input.newCallerName,
      newCallerAddress: input.newCallerAddress,
      requestHuman: input.requestHuman,
    });
    const reply =
      decision.action === "offer_slots"
        ? `I found ${decision.offers.length} valid appointment option(s). ${decision.reason}.`
        : decision.action === "escalate"
          ? `I need to connect you with a person. ${decision.reason}.`
          : `We'll need a quick office follow-up. ${decision.reason}.`;
    state = appendTranscript(state, input.callId, "assistant", reply);
    saveState(state);
    return NextResponse.json({ decision, calledAtIso });
  }

  if (step === "book") {
    const input = BookSchema.parse(body);
    const calledAtIso = input.calledAtIso ?? getDemoNow().toISOString();
    let state = loadState();
    const result = applyBooking(state, { ...input, calledAtIso });
    state = appendTranscript(
      result.state,
      input.callId,
      "assistant",
      `You're booked with ${result.job.technicianName} at ${result.job.appointmentStartIso}. The office has the complete job record.`,
    );
    saveState(state);
    return NextResponse.json({ job: result.job });
  }

  if (step === "escalate") {
    const input = EscalateSchema.parse(body);
    const calledAtIso = input.calledAtIso ?? getDemoNow().toISOString();
    let state = loadState();
    const result = input.asFollowUp
      ? applyNeedsFollowUp(state, { ...input, calledAtIso })
      : applyEscalation(state, { ...input, calledAtIso });
    state = appendTranscript(
      result.state,
      input.callId,
      "assistant",
      input.asFollowUp
        ? "I've flagged this for office follow-up at open."
        : "Connecting you to a person now. Your details are on the job record.",
    );
    saveState(state);
    return NextResponse.json({ job: result.job });
  }

  return NextResponse.json({ error: "Unknown step" }, { status: 400 });
}
