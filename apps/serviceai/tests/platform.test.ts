import { describe, expect, it } from "vitest";
import {
  applyBooking,
  evaluateCall,
  shouldEscalate,
} from "../src/lib/booking/engine";
import { defaultCrmAdapter } from "../src/lib/bridge/crm";
import { createConversation } from "../src/lib/conversations";
import {
  advanceJourney,
  runJourneyToCompletion,
  startJourney,
} from "../src/lib/journeys/runner";
import { parseSmsIntent } from "../src/lib/messaging/intent";
import { afterJobCommitted } from "../src/lib/orchestrate";
import {
  createSeedState,
  DEFAULT_DEMO_NOW_ISO,
  DEMO_EXISTING_CUSTOMER_PHONE,
  DEMO_NEW_CALLER_PHONE,
} from "../src/lib/seed";
import { startCall } from "../src/lib/store";

describe("SMS intent → same booking engine", () => {
  it("parses no-heat emergency and books existing customer", () => {
    let state = createSeedState();
    const ctx = parseSmsIntent(
      "No heat — furnace blowing cold air",
      DEMO_EXISTING_CUSTOMER_PHONE,
      DEFAULT_DEMO_NOW_ISO,
    );
    expect(ctx.jobType).toBe("no_heat");
    expect(ctx.urgency).toBe("emergency");

    const decision = evaluateCall(state, ctx);
    expect(decision.action).toBe("offer_slots");
    if (decision.action !== "offer_slots") return;

    const started = startCall(
      state,
      DEMO_EXISTING_CUSTOMER_PHONE,
      "sms",
      DEFAULT_DEMO_NOW_ISO,
    );
    state = started.state;
    const { job } = applyBooking(state, {
      callId: started.call.id,
      slotId: decision.offers[0].slotId,
      fromPhone: DEMO_EXISTING_CUSTOMER_PHONE,
      calledAtIso: DEFAULT_DEMO_NOW_ISO,
      problemSummary: ctx.problemSummary,
      jobType: ctx.jobType,
      urgency: ctx.urgency,
      channel: "sms",
    });
    expect(job.status).toBe("booked");
    expect(job.customerName).toBe("Maria Delgado");
  });

  it("escalates gas smell from SMS text", () => {
    const state = createSeedState();
    const ctx = parseSmsIntent(
      "Strong gas smell near furnace",
      DEMO_EXISTING_CUSTOMER_PHONE,
      DEFAULT_DEMO_NOW_ISO,
    );
    expect(shouldEscalate(state.shop, ctx).escalate).toBe(true);
    const decision = evaluateCall(state, ctx);
    expect(decision.action).toBe("escalate");
  });
});

describe("Knowledge edits affect next decision", () => {
  it("raising cutoff still offers emergency slots", () => {
    const state = createSeedState();
    state.shop.emergencyCutoffHour = 23;
    const decision = evaluateCall(state, {
      fromPhone: DEMO_EXISTING_CUSTOMER_PHONE,
      calledAtIso: DEFAULT_DEMO_NOW_ISO,
      problemSummary: "No heat",
      jobType: "no_heat",
      urgency: "emergency",
    });
    expect(decision.action).toBe("offer_slots");
  });

  it("adding a keyword forces escalation on the next evaluate", () => {
    const state = createSeedState();
    state.shop.escalateKeywords = [
      ...state.shop.escalateKeywords,
      "blowing cold",
    ];
    const decision = evaluateCall(state, {
      fromPhone: DEMO_EXISTING_CUSTOMER_PHONE,
      calledAtIso: DEFAULT_DEMO_NOW_ISO,
      problemSummary: "Furnace blowing cold air",
      jobType: "no_heat",
      urgency: "emergency",
    });
    expect(decision.action).toBe("escalate");
  });
});

describe("Journey fire", () => {
  it("runs speed-to-lead journey end-to-end and books", () => {
    let state = createSeedState();
    const conv = createConversation(state, {
      channel: "sms",
      fromPhone: DEMO_NEW_CALLER_PHONE,
      fromName: "Chris Alvarez",
      atIso: DEFAULT_DEMO_NOW_ISO,
      openingMessage: {
        role: "customer",
        body: "Need a furnace tune-up",
        channel: "sms",
      },
    });
    state = conv.state;
    const started = startJourney(
      state,
      "journey_speed_to_lead",
      conv.conversation.id,
      undefined,
      DEFAULT_DEMO_NOW_ISO,
    );
    const finished = runJourneyToCompletion(
      started.state,
      started.run.id,
      DEFAULT_DEMO_NOW_ISO,
      "Need a furnace tune-up",
    );
    expect(finished.run.status).toBe("completed");
    const job = finished.state.jobs.find(
      (j) => j.conversationId === conv.conversation.id,
    );
    expect(job?.status).toBe("booked");
    expect(
      finished.state.conversations
        .find((c) => c.id === conv.conversation.id)
        ?.messages.some((m) => m.channel === "email" || m.channel === "sms"),
    ).toBe(true);
  });

  it("after-hours emergency journey sends SMS confirm + CRM write", () => {
    let state = createSeedState();
    const conv = createConversation(state, {
      channel: "voice",
      fromPhone: DEMO_EXISTING_CUSTOMER_PHONE,
      fromName: "Maria Delgado",
      atIso: DEFAULT_DEMO_NOW_ISO,
    });
    state = conv.state;
    const call = startCall(
      state,
      DEMO_EXISTING_CUSTOMER_PHONE,
      "sim",
      DEFAULT_DEMO_NOW_ISO,
      conv.conversation.id,
    );
    state = call.state;
    const decision = evaluateCall(state, {
      fromPhone: DEMO_EXISTING_CUSTOMER_PHONE,
      calledAtIso: DEFAULT_DEMO_NOW_ISO,
      problemSummary: "No heat",
      jobType: "no_heat",
      urgency: "emergency",
    });
    expect(decision.action).toBe("offer_slots");
    if (decision.action !== "offer_slots") return;
    const booked = applyBooking(state, {
      callId: call.call.id,
      slotId: decision.offers[0].slotId,
      fromPhone: DEMO_EXISTING_CUSTOMER_PHONE,
      calledAtIso: DEFAULT_DEMO_NOW_ISO,
      problemSummary: "No heat",
      jobType: "no_heat",
      urgency: "emergency",
      conversationId: conv.conversation.id,
      channel: "voice",
    });
    const orch = afterJobCommitted(booked.state, booked.job, {
      nowIso: DEFAULT_DEMO_NOW_ISO,
      runImmediateJourneySteps: true,
    });
    expect(orch.crmId).toBeTruthy();
    expect(orch.journeyRun).toBeTruthy();
    const msgs = orch.state.conversations.find(
      (c) => c.id === conv.conversation.id,
    )?.messages;
    expect(msgs?.some((m) => m.channel === "sms" && m.role === "ai")).toBe(true);

    if (orch.journeyRun && orch.journeyRun.status === "running") {
      const advanced = advanceJourney(
        orch.state,
        orch.journeyRun.id,
        "2026-01-16T08:00:00-05:00",
        { force: true },
      );
      expect(advanced.completedStep).toBe(true);
    }
  });
});

describe("CRM stub writeback", () => {
  it("writes customer/job/appointment into crmRecords", () => {
    let state = createSeedState();
    const call = startCall(
      state,
      DEMO_EXISTING_CUSTOMER_PHONE,
      "sim",
      DEFAULT_DEMO_NOW_ISO,
    );
    state = call.state;
    const decision = evaluateCall(state, {
      fromPhone: DEMO_EXISTING_CUSTOMER_PHONE,
      calledAtIso: DEFAULT_DEMO_NOW_ISO,
      problemSummary: "No heat",
      jobType: "no_heat",
      urgency: "emergency",
    });
    if (decision.action !== "offer_slots") throw new Error("expected offers");
    const booked = applyBooking(state, {
      callId: call.call.id,
      slotId: decision.offers[0].slotId,
      fromPhone: DEMO_EXISTING_CUSTOMER_PHONE,
      calledAtIso: DEFAULT_DEMO_NOW_ISO,
      problemSummary: "No heat",
      jobType: "no_heat",
      urgency: "emergency",
    });
    const { state: next, record } = defaultCrmAdapter.writeJob(
      booked.state,
      booked.job,
    );
    expect(record.externalSystem).toBe("in_app_stub");
    expect(record.customerName).toBe("Maria Delgado");
    expect(record.appointmentStartIso).toBeTruthy();
    expect(next.crmRecords[0].jobId).toBe(booked.job.id);
  });
});
