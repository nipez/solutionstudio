import { NextResponse } from "next/server";
import {
  applyBooking,
  applyEscalation,
  evaluateCall,
  getDemoNow,
  normalizePhone,
} from "@/lib/booking/engine";
import {
  appendTranscript,
  loadState,
  saveState,
  startCall,
} from "@/lib/store";
import {
  fromTwilioLike,
  fromVapiLike,
  toIncomingCallContext,
  VoiceWebhookSchema,
} from "@/lib/voice/adapter";

export const runtime = "nodejs";

/**
 * Stub voice webhook.
 * POST JSON shaped like our VoiceWebhookEvent, or Twilio/Vapi-like bodies
 * with `?provider=twilio|vapi`. No provider keys required for the demo.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const providerHint = url.searchParams.get("provider") ?? "stub";
  const raw = (await request.json()) as Record<string, unknown>;

  let event;
  try {
    if (providerHint === "twilio") event = fromTwilioLike(raw);
    else if (providerHint === "vapi") event = fromVapiLike(raw);
    else event = VoiceWebhookSchema.parse({ ...raw, provider: "stub" });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "Invalid webhook payload", detail: String(err) },
      { status: 400 },
    );
  }

  const calledAtIso = event.calledAtIso ?? getDemoNow().toISOString();
  let state = loadState();

  let callId = event.callId;
  if (!callId || event.event === "call.started") {
    const started = startCall(
      state,
      normalizePhone(event.fromPhone),
      "voice_webhook",
      calledAtIso,
    );
    state = started.state;
    callId = started.call.id;
    saveState(state);
  }

  if (event.speechText) {
    state = appendTranscript(state, callId, "caller", event.speechText);
    saveState(state);
  }

  const ctx = toIncomingCallContext(event, calledAtIso);
  if (!ctx) {
    return NextResponse.json({
      ok: true,
      callId,
      message: "Event accepted; waiting for structured intent",
    });
  }

  const decision = evaluateCall(state, ctx);

  if (decision.action === "escalate") {
    const { state: next, job } = applyEscalation(state, {
      callId,
      fromPhone: ctx.fromPhone,
      calledAtIso,
      problemSummary: ctx.problemSummary,
      jobType: ctx.jobType,
      urgency: ctx.urgency,
      reason: decision.reason,
      newCallerName: ctx.newCallerName,
      newCallerAddress: ctx.newCallerAddress,
      requestHuman: ctx.requestHuman,
    });
    saveState(next);
    return NextResponse.json({
      ok: true,
      callId,
      decision,
      job,
      say: `I need to connect you with a dispatcher. ${decision.reason}`,
    });
  }

  if (decision.action === "needs_follow_up") {
    return NextResponse.json({
      ok: true,
      callId,
      decision,
      say: decision.reason,
    });
  }

  // Auto-book first offer for webhook path (voice can confirm in a later slice)
  const slotId = decision.offers[0]?.slotId;
  if (!slotId) {
    return NextResponse.json({
      ok: true,
      callId,
      decision,
      say: "I could not find an open appointment.",
    });
  }

  const { state: next, job } = applyBooking(state, {
    callId,
    slotId,
    fromPhone: ctx.fromPhone,
    calledAtIso,
    problemSummary: ctx.problemSummary,
    jobType: ctx.jobType,
    urgency: ctx.urgency,
    newCallerName: ctx.newCallerName,
    newCallerAddress: ctx.newCallerAddress,
  });
  saveState(next);

  return NextResponse.json({
    ok: true,
    callId,
    decision,
    job,
    say: `Booked ${job.appointmentStartIso} with ${job.technicianName}.`,
  });
}

export async function GET() {
  return NextResponse.json({
    endpoint: "/api/voice/webhook",
    providers: ["stub", "twilio", "vapi"],
    note: "No API keys required. POST a stub intent payload to exercise the same booking engine as the sim UI.",
    example: {
      provider: "stub",
      event: "call.intent",
      fromPhone: "+15550120001",
      calledAtIso: "2026-01-15T21:48:00-05:00",
      intent: {
        jobType: "no_heat",
        urgency: "emergency",
        problemSummary: "Furnace blowing cold air, house at 58°F",
      },
    },
  });
}
