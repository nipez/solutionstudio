import { NextResponse } from "next/server";
import { z } from "zod";
import {
  applyBooking,
  applyEscalation,
  applyNeedsFollowUp,
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
import { appendTranscript, loadState, saveState, startCall } from "@/lib/store";

export const runtime = "nodejs";

const StartSchema = z.object({
  fromPhone: z.string().min(7),
  calledAtIso: z.string().optional(),
});

const EvaluateSchema = z.object({
  callId: z.string(),
  conversationId: z.string().optional(),
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
  conversationId: z.string().optional(),
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
  conversationId: z.string().optional(),
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
    const phone = normalizePhone(input.fromPhone);
    const identified = identifyCaller(state, phone);
    const greeting = state.shop.afterHoursGreeting;

    const conv = createConversation(state, {
      channel: "voice",
      fromPhone: phone,
      fromName: identified.displayName,
      atIso: calledAtIso,
      customerId: identified.customer?.id,
      openingMessage: { role: "ai", body: greeting, channel: "voice" },
    });
    state = conv.state;

    const started = startCall(state, phone, "sim", calledAtIso, conv.conversation.id);
    state = appendTranscript(
      started.state,
      started.call.id,
      "assistant",
      greeting,
    );
    saveState(state);
    return NextResponse.json({
      call: { ...started.call, conversationId: conv.conversation.id },
      conversationId: conv.conversation.id,
      calledAtIso,
      identified,
    });
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
    if (input.conversationId) {
      state = appendConversationMessage(
        state,
        input.conversationId,
        "customer",
        `${input.jobType}: ${input.problemSummary}`,
        "voice",
        calledAtIso,
      );
    }
    const decision = evaluateCall(state, {
      fromPhone: input.fromPhone,
      calledAtIso,
      problemSummary: input.problemSummary,
      jobType: input.jobType,
      urgency: input.urgency,
      newCallerName: input.newCallerName,
      newCallerAddress: input.newCallerAddress,
      requestHuman: input.requestHuman,
      channel: "voice",
    });
    const reply =
      decision.action === "offer_slots"
        ? `I found ${decision.offers.length} valid appointment option(s). ${decision.reason}.`
        : decision.action === "escalate"
          ? `I need to connect you with a person. ${decision.reason}.`
          : `We'll need a quick office follow-up. ${decision.reason}.`;
    state = appendTranscript(state, input.callId, "assistant", reply);
    if (input.conversationId) {
      state = appendConversationMessage(
        state,
        input.conversationId,
        "ai",
        reply,
        "voice",
        calledAtIso,
      );
    }
    saveState(state);
    return NextResponse.json({ decision, calledAtIso });
  }

  if (step === "book") {
    const input = BookSchema.parse(body);
    const calledAtIso = input.calledAtIso ?? getDemoNow().toISOString();
    let state = loadState();
    const result = applyBooking(state, {
      ...input,
      calledAtIso,
      conversationId: input.conversationId,
      channel: "voice",
    });
    const orch = afterJobCommitted(result.state, result.job, {
      nowIso: calledAtIso,
      runImmediateJourneySteps: true,
    });
    state = orch.state;
    const convId = input.conversationId ?? orch.job.conversationId;
    if (convId) {
      state = appendConversationMessage(
        state,
        convId,
        "ai",
        `You're booked with ${orch.job.technicianName}. The office and CRM have the complete job record.`,
        "voice",
        calledAtIso,
      );
    }
    saveState(state);
    return NextResponse.json({
      job: orch.job,
      crmId: orch.crmId,
      journeyRun: orch.journeyRun,
      conversationId: convId,
    });
  }

  if (step === "escalate") {
    const input = EscalateSchema.parse(body);
    const calledAtIso = input.calledAtIso ?? getDemoNow().toISOString();
    let state = loadState();
    const result = input.asFollowUp
      ? applyNeedsFollowUp(state, {
          ...input,
          calledAtIso,
          conversationId: input.conversationId,
          channel: "voice",
        })
      : applyEscalation(state, {
          ...input,
          calledAtIso,
          conversationId: input.conversationId,
          channel: "voice",
        });
    const orch = afterEscalationCommitted(result.state, result.job);
    if (input.conversationId) {
      state = appendConversationMessage(
        orch.state,
        input.conversationId,
        "ai",
        input.asFollowUp
          ? "I've flagged this for office follow-up at open."
          : "Connecting you to a person now. Your details are on the job record.",
        "voice",
        calledAtIso,
      );
    } else {
      state = orch.state;
    }
    saveState(state);
    return NextResponse.json({ job: orch.job, crmId: orch.crmId });
  }

  return NextResponse.json({ error: "Unknown step" }, { status: 400 });
}
