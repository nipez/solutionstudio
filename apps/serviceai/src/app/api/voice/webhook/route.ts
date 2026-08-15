import { NextResponse } from "next/server";
import {
  applyBooking,
  applyEscalation,
  evaluateCall,
  getDemoNow,
  identifyCaller,
  normalizePhone,
} from "@/lib/booking/engine";
import {
  appendConversationMessage,
  createConversation,
} from "@/lib/conversations";
import { afterEscalationCommitted, afterJobCommitted } from "@/lib/orchestrate";
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
  const phone = normalizePhone(event.fromPhone);
  const identified = identifyCaller(state, phone);

  const conv = createConversation(state, {
    channel: "voice",
    fromPhone: phone,
    fromName: identified.displayName,
    atIso: calledAtIso,
    customerId: identified.customer?.id,
    openingMessage: {
      role: "ai",
      body: state.shop.afterHoursGreeting,
      channel: "voice",
    },
  });
  state = conv.state;

  let callId = event.callId;
  if (!callId || event.event === "call.started") {
    const started = startCall(
      state,
      phone,
      "voice_webhook",
      calledAtIso,
      conv.conversation.id,
    );
    state = started.state;
    callId = started.call.id;
  }

  if (event.speechText) {
    state = appendTranscript(state, callId, "caller", event.speechText);
    state = appendConversationMessage(
      state,
      conv.conversation.id,
      "customer",
      event.speechText,
      "voice",
      calledAtIso,
    );
  }

  const ctx = toIncomingCallContext(event, calledAtIso);
  if (!ctx) {
    saveState(state);
    return NextResponse.json({
      ok: true,
      callId,
      conversationId: conv.conversation.id,
      message: "Event accepted; waiting for structured intent",
    });
  }

  ctx.channel = "voice";
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
      conversationId: conv.conversation.id,
      channel: "voice",
    });
    const orch = afterEscalationCommitted(next, job);
    saveState(orch.state);
    return NextResponse.json({
      ok: true,
      callId,
      conversationId: conv.conversation.id,
      decision,
      job: orch.job,
      crmId: orch.crmId,
      say: `I need to connect you with a dispatcher. ${decision.reason}`,
    });
  }

  if (decision.action === "needs_follow_up") {
    saveState(state);
    return NextResponse.json({
      ok: true,
      callId,
      conversationId: conv.conversation.id,
      decision,
      say: decision.reason,
    });
  }

  const slotId = decision.offers[0]?.slotId;
  if (!slotId) {
    saveState(state);
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
    conversationId: conv.conversation.id,
    channel: "voice",
  });
  const orch = afterJobCommitted(next, job, {
    nowIso: calledAtIso,
    runImmediateJourneySteps: true,
  });
  saveState(orch.state);

  return NextResponse.json({
    ok: true,
    callId,
    conversationId: conv.conversation.id,
    decision,
    job: orch.job,
    crmId: orch.crmId,
    journeyRun: orch.journeyRun,
    say: `Booked ${job.appointmentStartIso} with ${job.technicianName}.`,
  });
}

export async function GET() {
  return NextResponse.json({
    endpoint: "/api/voice/webhook",
    providers: ["stub", "twilio", "vapi"],
    note: "No API keys required. Same booking engine + CRM stub + journeys as the Voice UI.",
  });
}
