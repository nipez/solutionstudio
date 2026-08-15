import { describe, expect, it } from "vitest";
import {
  applyBooking,
  applyEscalation,
  evaluateCall,
  identifyCaller,
  isWithinBusinessHours,
  normalizePhone,
  shouldEscalate,
} from "../src/lib/booking/engine";
import {
  createSeedState,
  DEFAULT_DEMO_NOW_ISO,
  DEMO_EXISTING_CUSTOMER_PHONE,
  DEMO_NEW_CALLER_PHONE,
} from "../src/lib/seed";
import { startCall } from "../src/lib/store";

describe("phone + caller identity", () => {
  it("normalizes 10-digit US numbers", () => {
    expect(normalizePhone("5550120001")).toBe("+15550120001");
    expect(normalizePhone("(555) 012-0001")).toBe("+15550120001");
  });

  it("recognizes existing customer and property from caller ID", () => {
    const state = createSeedState();
    const caller = identifyCaller(state, DEMO_EXISTING_CUSTOMER_PHONE);
    expect(caller.kind).toBe("existing");
    expect(caller.customer?.name).toBe("Maria Delgado");
    expect(caller.property?.addressLine1).toBe("1847 Oak Ridge Dr");
  });

  it("treats unknown numbers as new callers", () => {
    const state = createSeedState();
    const caller = identifyCaller(state, DEMO_NEW_CALLER_PHONE, "Chris Alvarez");
    expect(caller.kind).toBe("new");
    expect(caller.displayName).toBe("Chris Alvarez");
  });
});

describe("business hours vs after-hours", () => {
  it("marks 9:48 PM as after hours", () => {
    const state = createSeedState();
    expect(isWithinBusinessHours(state.shop, new Date(DEFAULT_DEMO_NOW_ISO))).toBe(
      false,
    );
  });

  it("marks 10:00 AM weekday as open", () => {
    const state = createSeedState();
    expect(
      isWithinBusinessHours(state.shop, new Date("2026-01-15T10:00:00-05:00")),
    ).toBe(true);
  });
});

describe("escalation rules", () => {
  it("escalates gas smell job types", () => {
    const state = createSeedState();
    const result = shouldEscalate(state.shop, {
      jobType: "gas_smell",
      problemSummary: "Smell near furnace",
    });
    expect(result.escalate).toBe(true);
  });

  it("escalates when caller requests a person", () => {
    const state = createSeedState();
    const result = shouldEscalate(state.shop, {
      jobType: "no_heat",
      problemSummary: "Cold air",
      requestHuman: true,
    });
    expect(result.escalate).toBe(true);
    expect(result.reason).toMatch(/requested a person/i);
  });
});

describe("after-hours booking decisions", () => {
  it("offers morning emergency slot for existing customer at 9:48 PM (past cutoff)", () => {
    const state = createSeedState();
    const decision = evaluateCall(state, {
      fromPhone: DEMO_EXISTING_CUSTOMER_PHONE,
      calledAtIso: DEFAULT_DEMO_NOW_ISO,
      problemSummary: "Furnace blowing cold air, house at 58F",
      jobType: "no_heat",
      urgency: "emergency",
    });

    expect(decision.action).toBe("offer_slots");
    if (decision.action !== "offer_slots") return;
    expect(decision.caller.kind).toBe("existing");
    expect(decision.caller.property?.addressLine1).toContain("Oak Ridge");
    expect(decision.reason).toMatch(/cutoff|morning/i);
    expect(decision.offers.length).toBeGreaterThan(0);
    expect(decision.offers[0].kind).toBe("emergency");
    // First offer should be Thu 8am emergency, not the past Wed evening slots
    expect(new Date(decision.offers[0].startIso).getUTCHours()).toBeGreaterThanOrEqual(12);
  });

  it("offers routine next-day capacity for after-hours routine work", () => {
    const state = createSeedState();
    const decision = evaluateCall(state, {
      fromPhone: DEMO_EXISTING_CUSTOMER_PHONE,
      calledAtIso: DEFAULT_DEMO_NOW_ISO,
      problemSummary: "Annual tune-up",
      jobType: "tune_up",
      urgency: "routine",
    });
    expect(decision.action).toBe("offer_slots");
    if (decision.action !== "offer_slots") return;
    expect(decision.reason).toMatch(/routine|business/i);
    expect(decision.offers.every((o) => o.kind === "routine")).toBe(true);
  });

  it("books a complete job record for the 9:48 PM path", () => {
    let state = createSeedState();
    const started = startCall(
      state,
      DEMO_EXISTING_CUSTOMER_PHONE,
      "sim",
      DEFAULT_DEMO_NOW_ISO,
    );
    state = started.state;

    const decision = evaluateCall(state, {
      fromPhone: DEMO_EXISTING_CUSTOMER_PHONE,
      calledAtIso: DEFAULT_DEMO_NOW_ISO,
      problemSummary: "No heat",
      jobType: "no_heat",
      urgency: "emergency",
    });
    expect(decision.action).toBe("offer_slots");
    if (decision.action !== "offer_slots") return;

    const { state: next, job } = applyBooking(state, {
      callId: started.call.id,
      slotId: decision.offers[0].slotId,
      fromPhone: DEMO_EXISTING_CUSTOMER_PHONE,
      calledAtIso: DEFAULT_DEMO_NOW_ISO,
      problemSummary: "No heat",
      jobType: "no_heat",
      urgency: "emergency",
    });

    expect(job.status).toBe("booked");
    expect(job.isExistingCustomer).toBe(true);
    expect(job.customerName).toBe("Maria Delgado");
    expect(job.propertyAddress).toContain("1847 Oak Ridge Dr");
    expect(job.technicianName).toBeTruthy();
    expect(job.appointmentStartIso).toBeTruthy();
    expect(next.slots.find((s) => s.id === decision.offers[0].slotId)?.bookedJobId).toBe(
      job.id,
    );
  });

  it("books a new caller routine appointment when name and address are provided", () => {
    let state = createSeedState();
    const started = startCall(state, DEMO_NEW_CALLER_PHONE, "sim", DEFAULT_DEMO_NOW_ISO);
    state = started.state;

    const decision = evaluateCall(state, {
      fromPhone: DEMO_NEW_CALLER_PHONE,
      calledAtIso: DEFAULT_DEMO_NOW_ISO,
      problemSummary: "Need a tune-up",
      jobType: "tune_up",
      urgency: "routine",
      newCallerName: "Chris Alvarez",
      newCallerAddress: "221 Benton Ave, Westerville, OH 43081",
    });
    expect(decision.action).toBe("offer_slots");
    if (decision.action !== "offer_slots") return;

    const { job } = applyBooking(state, {
      callId: started.call.id,
      slotId: decision.offers[0].slotId,
      fromPhone: DEMO_NEW_CALLER_PHONE,
      calledAtIso: DEFAULT_DEMO_NOW_ISO,
      problemSummary: "Need a tune-up",
      jobType: "tune_up",
      urgency: "routine",
      newCallerName: "Chris Alvarez",
      newCallerAddress: "221 Benton Ave, Westerville, OH 43081",
    });

    expect(job.status).toBe("booked");
    expect(job.isExistingCustomer).toBe(false);
    expect(job.customerName).toBe("Chris Alvarez");
    expect(job.propertyAddress).toContain("Benton");
  });

  it("requires follow-up when new routine caller is missing address", () => {
    const state = createSeedState();
    const decision = evaluateCall(state, {
      fromPhone: DEMO_NEW_CALLER_PHONE,
      calledAtIso: DEFAULT_DEMO_NOW_ISO,
      problemSummary: "Tune-up",
      jobType: "tune_up",
      urgency: "routine",
      newCallerName: "Chris Alvarez",
    });
    expect(decision.action).toBe("needs_follow_up");
  });

  it("creates an escalated job for gas smell", () => {
    let state = createSeedState();
    const started = startCall(
      state,
      DEMO_EXISTING_CUSTOMER_PHONE,
      "sim",
      DEFAULT_DEMO_NOW_ISO,
    );
    state = started.state;

    const decision = evaluateCall(state, {
      fromPhone: DEMO_EXISTING_CUSTOMER_PHONE,
      calledAtIso: DEFAULT_DEMO_NOW_ISO,
      problemSummary: "Strong gas smell",
      jobType: "gas_smell",
      urgency: "emergency",
    });
    expect(decision.action).toBe("escalate");
    if (decision.action !== "escalate") return;

    const { job } = applyEscalation(state, {
      callId: started.call.id,
      fromPhone: DEMO_EXISTING_CUSTOMER_PHONE,
      calledAtIso: DEFAULT_DEMO_NOW_ISO,
      problemSummary: "Strong gas smell",
      jobType: "gas_smell",
      urgency: "emergency",
      reason: decision.reason,
    });

    expect(job.status).toBe("escalated");
    expect(job.escalateTo).toBe("on_call_dispatcher");
    expect(job.escalationReason).toBeTruthy();
  });
});
