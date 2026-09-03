import { NextResponse } from "next/server";
import { z } from "zod";
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
  findOrCreateSmsThread,
} from "@/lib/conversations";
import { parseSmsIntent } from "@/lib/messaging/intent";
import { afterEscalationCommitted, afterJobCommitted } from "@/lib/orchestrate";
import {
  findJourneyByTrigger,
  runJourneyToCompletion,
  startJourney,
} from "@/lib/journeys/runner";
import { loadState, saveState, startCall } from "@/lib/store";

export const runtime = "nodejs";

const InboundSchema = z.object({
  fromPhone: z.string().min(7),
  body: z.string().min(1),
  calledAtIso: z.string().optional(),
  newCallerName: z.string().optional(),
  newCallerAddress: z.string().optional(),
  /** When true, auto-book first offer (demo default). */
  autoBook: z.boolean().optional().default(true),
  /** Kick speed-to-lead journey for unknown numbers. */
  startSpeedToLead: z.boolean().optional(),
});

/**
 * Stub SMS webhook — no Twilio keys required.
 * Inbound text → same booking engine as voice.
 */
export async function POST(request: Request) {
  const raw = await request.json();
  const input = InboundSchema.parse(raw);
  const calledAtIso = input.calledAtIso ?? getDemoNow().toISOString();
  let state = loadState();
  const phone = normalizePhone(input.fromPhone);
  const identified = identifyCaller(
    state,
    phone,
    input.newCallerName,
    input.newCallerAddress,
  );

  const thread = findOrCreateSmsThread(
    state,
    phone,
    calledAtIso,
    identified.displayName,
  );
  state = thread.state;
  let conversation = thread.conversation;

  state = appendConversationMessage(
    state,
    conversation.id,
    "customer",
    input.body,
    "sms",
    calledAtIso,
  );

  const isNewLead = identified.kind === "new";
  const startSpeed =
    input.startSpeedToLead ?? (isNewLead && !conversation.journeyRunId);

  if (startSpeed) {
    const journey = findJourneyByTrigger(state, "new_lead_inbound_sms");
    if (journey) {
      const started = startJourney(
        state,
        journey.id,
        conversation.id,
        undefined,
        calledAtIso,
      );
      state = started.state;
      const finished = runJourneyToCompletion(
        state,
        started.run.id,
        calledAtIso,
        input.body,
      );
      state = finished.state;
      saveState(state);
      const job = state.jobs.find((j) => j.conversationId === conversation.id);
      return NextResponse.json({
        ok: true,
        conversationId: conversation.id,
        journeyRun: finished.run,
        job: job ?? null,
        mode: "speed_to_lead_journey",
      });
    }
  }

  const ctx = parseSmsIntent(input.body, phone, calledAtIso, {
    newCallerName: input.newCallerName ?? (isNewLead ? identified.displayName : undefined),
    newCallerAddress: input.newCallerAddress,
  });
  if (isNewLead && ctx.urgency === "routine" && !ctx.newCallerAddress) {
    ctx.newCallerName = input.newCallerName ?? "SMS lead";
    // Allow evaluate to request follow-up if still incomplete
  }

  const decision = evaluateCall(state, ctx);
  const call = startCall(state, phone, "sms", calledAtIso, conversation.id);
  state = call.state;

  if (decision.action === "escalate") {
    const esc = applyEscalation(state, {
      callId: call.call.id,
      fromPhone: phone,
      calledAtIso,
      problemSummary: ctx.problemSummary,
      jobType: ctx.jobType,
      urgency: ctx.urgency,
      reason: decision.reason,
      newCallerName: ctx.newCallerName,
      newCallerAddress: ctx.newCallerAddress,
      conversationId: conversation.id,
      channel: "sms",
    });
    const orch = afterEscalationCommitted(esc.state, esc.job);
    state = appendConversationMessage(
      orch.state,
      conversation.id,
      "ai",
      `A teammate needs to take this: ${decision.reason}`,
      "sms",
      calledAtIso,
    );
    saveState(state);
    return NextResponse.json({
      ok: true,
      conversationId: conversation.id,
      decision,
      job: orch.job,
      crmId: orch.crmId,
    });
  }

  if (decision.action === "needs_follow_up") {
    state = appendConversationMessage(
      state,
      conversation.id,
      "ai",
      decision.reason + " Can you reply with your name and service address?",
      "sms",
      calledAtIso,
    );
    saveState(state);
    return NextResponse.json({
      ok: true,
      conversationId: conversation.id,
      decision,
    });
  }

  const offer = decision.offers[0];
  const offerText = `Hi ${decision.caller.displayName} — ${decision.reason}. I can book ${offer.label} with ${offer.technicianName}.`;
  state = appendConversationMessage(
    state,
    conversation.id,
    "ai",
    offerText,
    "sms",
    calledAtIso,
  );

  if (input.autoBook) {
    const booked = applyBooking(state, {
      callId: call.call.id,
      slotId: offer.slotId,
      fromPhone: phone,
      calledAtIso,
      problemSummary: ctx.problemSummary,
      jobType: ctx.jobType,
      urgency: ctx.urgency,
      newCallerName: ctx.newCallerName,
      newCallerAddress: ctx.newCallerAddress,
      conversationId: conversation.id,
      channel: "sms",
    });
    const orch = afterJobCommitted(booked.state, booked.job, {
      nowIso: calledAtIso,
      runImmediateJourneySteps: true,
    });
    state = appendConversationMessage(
      orch.state,
      conversation.id,
      "ai",
      `Booked. Confirmation sent. CRM record ${orch.crmId}.`,
      "sms",
      calledAtIso,
    );
    saveState(state);
    return NextResponse.json({
      ok: true,
      conversationId: conversation.id,
      decision,
      job: orch.job,
      crmId: orch.crmId,
      journeyRun: orch.journeyRun,
    });
  }

  saveState(state);
  return NextResponse.json({
    ok: true,
    conversationId: conversation.id,
    decision,
  });
}

export async function GET() {
  const state = loadState();
  const sms = state.conversations.filter((c) => c.channel === "sms");
  return NextResponse.json({
    endpoint: "/api/messaging/webhook",
    note: "No Twilio keys required. POST { fromPhone, body }.",
    threads: sms.map((c) => ({
      id: c.id,
      fromPhone: c.fromPhone,
      status: c.status,
      messages: c.messages.length,
    })),
    example: {
      fromPhone: "+15550120001",
      body: "No heat — furnace blowing cold air",
      calledAtIso: "2026-01-15T21:48:00-05:00",
    },
  });
}
