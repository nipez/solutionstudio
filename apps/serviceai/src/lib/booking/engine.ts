import { DEFAULT_DEMO_NOW_ISO } from "../seed";
import type {
  BookingDecision,
  CalendarSlot,
  ConfirmBookingInput,
  Customer,
  EscalateInput,
  IdentifiedCaller,
  IncomingCallContext,
  JobRecord,
  Property,
  ShopRules,
  ShopState,
  SlotOffer,
  Technician,
  Urgency,
  Weekday,
} from "../types";

const WEEKDAYS: Weekday[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (phone.startsWith("+")) return `+${digits}`;
  return digits ? `+${digits}` : phone;
}

export function getDemoNow(overrideIso?: string): Date {
  return new Date(overrideIso ?? process.env.DEMO_NOW ?? DEFAULT_DEMO_NOW_ISO);
}

export function zonedParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map((p) => [p.type, p.value]),
  );
  const weekday = (parts.weekday || "Monday").toLowerCase() as Weekday;
  const hour = Number(parts.hour === "24" ? "0" : parts.hour);
  const minute = Number(parts.minute);
  return {
    weekday,
    hour,
    minute,
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

export function isWithinBusinessHours(shop: ShopRules, at: Date): boolean {
  const { weekday, hour, minute } = zonedParts(at, shop.timezone);
  const window = shop.businessHours[weekday];
  if (!window) return false;
  const [openH, openM] = window.open.split(":").map(Number);
  const [closeH, closeM] = window.close.split(":").map(Number);
  const mins = hour * 60 + minute;
  const open = openH * 60 + openM;
  const close = closeH * 60 + closeM;
  return mins >= open && mins < close;
}

export function identifyCaller(
  state: Pick<ShopState, "customers" | "properties">,
  fromPhone: string,
  newCallerName?: string,
  newCallerAddress?: string,
): IdentifiedCaller {
  const phone = normalizePhone(fromPhone);
  const customer = state.customers.find((c) => normalizePhone(c.phone) === phone);
  if (!customer) {
    return {
      kind: "new",
      displayName: newCallerName?.trim() || "New caller",
    };
  }
  const property = state.properties.find((p) => p.id === customer.propertyIds[0]);
  return {
    kind: "existing",
    customer,
    property,
    displayName: customer.name,
  };
}

function matchesEscalateKeyword(shop: ShopRules, text: string): string | null {
  const lower = text.toLowerCase();
  for (const kw of shop.escalateKeywords) {
    if (lower.includes(kw.toLowerCase())) return kw;
  }
  return null;
}

export function shouldEscalate(
  shop: ShopRules,
  ctx: Pick<IncomingCallContext, "jobType" | "problemSummary" | "requestHuman">,
): { escalate: boolean; reason?: string } {
  if (ctx.requestHuman) {
    return { escalate: true, reason: "Caller requested a person" };
  }
  const normalizedType = ctx.jobType.trim().toLowerCase().replace(/\s+/g, "_");
  if (shop.alwaysEscalateJobTypes.includes(normalizedType)) {
    return {
      escalate: true,
      reason: `Job type "${ctx.jobType}" requires a human dispatcher`,
    };
  }
  const hit = matchesEscalateKeyword(shop, `${ctx.jobType} ${ctx.problemSummary}`);
  if (hit) {
    return {
      escalate: true,
      reason: `Safety / policy keyword matched: "${hit}"`,
    };
  }
  return { escalate: false };
}

function technicianName(techs: Technician[], id: string): string {
  return techs.find((t) => t.id === id)?.name ?? id;
}

function formatOfferLabel(
  shop: ShopRules,
  startIso: string,
  kind: "routine" | "emergency",
): string {
  const d = new Date(startIso);
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: shop.timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
  return kind === "emergency" ? `Emergency · ${label}` : `Appointment · ${label}`;
}

export function findAvailableOffers(
  state: ShopState,
  calledAt: Date,
  urgency: Urgency,
  limit = 3,
): SlotOffer[] {
  const { shop, slots, technicians } = state;
  const afterHours = !isWithinBusinessHours(shop, calledAt);
  const { hour } = zonedParts(calledAt, shop.timezone);

  const openSlots = slots
    .filter((s) => !s.bookedJobId && s.kind !== "blocked")
    .filter((s) => new Date(s.startIso).getTime() > calledAt.getTime())
    .sort((a, b) => +new Date(a.startIso) - +new Date(b.startIso));

  let candidates: CalendarSlot[] = [];

  if (urgency === "emergency") {
    if (afterHours && hour >= shop.emergencyCutoffHour) {
      // Past on-call cutoff: only next-morning emergency capacity
      candidates = openSlots.filter((s) => s.kind === "emergency");
    } else if (afterHours) {
      candidates = openSlots.filter((s) => s.kind === "emergency");
    } else {
      candidates = openSlots.filter((s) => s.kind === "emergency" || s.kind === "routine");
    }
  } else if (urgency === "same_day") {
    const dayKey = zonedParts(calledAt, shop.timezone).dateKey;
    candidates = openSlots.filter((s) => {
      const key = zonedParts(new Date(s.startIso), shop.timezone).dateKey;
      return key === dayKey && s.kind === "routine";
    });
    if (candidates.length === 0) {
      candidates = openSlots.filter((s) => s.kind === "routine");
    }
  } else {
    // Routine after hours → wait until morning / next business capacity
    candidates = openSlots.filter((s) => s.kind === "routine");
  }

  return candidates.slice(0, limit).map((s) => ({
    slotId: s.id,
    startIso: s.startIso,
    endIso: s.endIso,
    technicianId: s.technicianId,
    technicianName: technicianName(technicians, s.technicianId),
    label: formatOfferLabel(shop, s.startIso, s.kind === "emergency" ? "emergency" : "routine"),
    kind: s.kind === "emergency" ? "emergency" : "routine",
  }));
}

export function evaluateCall(state: ShopState, ctx: IncomingCallContext): BookingDecision {
  const calledAt = new Date(ctx.calledAtIso);
  const caller = identifyCaller(
    state,
    ctx.fromPhone,
    ctx.newCallerName,
    ctx.newCallerAddress,
  );
  const afterHours = !isWithinBusinessHours(state.shop, calledAt);

  const esc = shouldEscalate(state.shop, ctx);
  if (esc.escalate) {
    return {
      action: "escalate",
      reason: esc.reason!,
      caller,
      urgency: ctx.urgency,
      jobType: ctx.jobType,
      escalateTo: afterHours ? "on_call_dispatcher" : "morning_office",
    };
  }

  // New callers with incomplete identity for emergencies still bookable,
  // but routine new callers without a name/address need follow-up.
  if (
    caller.kind === "new" &&
    ctx.urgency === "routine" &&
    (!ctx.newCallerName?.trim() || !ctx.newCallerAddress?.trim())
  ) {
    return {
      action: "needs_follow_up",
      reason: "New caller needs name and service address before a routine booking",
      caller,
      urgency: ctx.urgency,
      jobType: ctx.jobType,
    };
  }

  const offers = findAvailableOffers(state, calledAt, ctx.urgency);
  if (offers.length === 0) {
    return {
      action: "escalate",
      reason: "No matching technician capacity for the requested urgency",
      caller,
      urgency: ctx.urgency,
      jobType: ctx.jobType,
      escalateTo: afterHours ? "on_call_dispatcher" : "morning_office",
    };
  }

  let reason: string;
  if (afterHours && ctx.urgency === "emergency") {
    const { hour } = zonedParts(calledAt, state.shop.timezone);
    reason =
      hour >= state.shop.emergencyCutoffHour
        ? "After-hours emergency past on-call cutoff — offering first morning emergency window"
        : "After-hours emergency — offering on-call / next emergency window";
  } else if (afterHours && ctx.urgency === "routine") {
    reason = "After-hours routine — offering next business-hours appointment";
  } else {
    reason = "Matching open capacity to urgency and trade rules";
  }

  return {
    action: "offer_slots",
    reason,
    caller,
    urgency: ctx.urgency,
    jobType: ctx.jobType,
    offers,
  };
}

function resolveCustomerForJob(
  state: ShopState,
  fromPhone: string,
  newCallerName?: string,
  newCallerAddress?: string,
): {
  customer?: Customer;
  property?: Property;
  customerName: string;
  propertyAddress?: string;
  isExistingCustomer: boolean;
  createdCustomer?: Customer;
  createdProperty?: Property;
} {
  const identified = identifyCaller(state, fromPhone, newCallerName, newCallerAddress);
  if (identified.kind === "existing" && identified.customer) {
    const address = identified.property
      ? `${identified.property.addressLine1}, ${identified.property.city}, ${identified.property.state} ${identified.property.postalCode}`
      : undefined;
    return {
      customer: identified.customer,
      property: identified.property,
      customerName: identified.customer.name,
      propertyAddress: address,
      isExistingCustomer: true,
    };
  }

  const customerId = `cust_${Date.now()}`;
  const propertyId = newCallerAddress ? `prop_${Date.now()}` : undefined;
  const createdProperty: Property | undefined = propertyId
    ? {
        id: propertyId,
        addressLine1: newCallerAddress!,
        city: "Unknown",
        state: "OH",
        postalCode: "00000",
        notes: "Captured during after-hours call — verify at dispatch",
      }
    : undefined;
  const createdCustomer: Customer = {
    id: customerId,
    name: newCallerName?.trim() || "New caller",
    phone: normalizePhone(fromPhone),
    propertyIds: propertyId ? [propertyId] : [],
    notes: "Created from after-hours booking",
  };

  return {
    customer: createdCustomer,
    property: createdProperty,
    customerName: createdCustomer.name,
    propertyAddress: createdProperty?.addressLine1,
    isExistingCustomer: false,
    createdCustomer,
    createdProperty,
  };
}

export function applyBooking(
  state: ShopState,
  input: ConfirmBookingInput,
): { state: ShopState; job: JobRecord } {
  const decision = evaluateCall(state, {
    fromPhone: input.fromPhone,
    calledAtIso: input.calledAtIso,
    problemSummary: input.problemSummary,
    jobType: input.jobType,
    urgency: input.urgency,
    newCallerName: input.newCallerName,
    newCallerAddress: input.newCallerAddress,
  });

  if (decision.action !== "offer_slots") {
    throw new Error(`Cannot book: ${decision.action} — ${decision.reason}`);
  }
  const offer = decision.offers.find((o) => o.slotId === input.slotId);
  if (!offer) {
    throw new Error("Selected slot is no longer available");
  }
  const slot = state.slots.find((s) => s.id === input.slotId && !s.bookedJobId);
  if (!slot) {
    throw new Error("Selected slot is already booked");
  }

  const resolved = resolveCustomerForJob(
    state,
    input.fromPhone,
    input.newCallerName,
    input.newCallerAddress,
  );

  const jobId = `job_${Date.now()}`;
  const job: JobRecord = {
    id: jobId,
    callId: input.callId,
    createdAtIso: new Date().toISOString(),
    status: "booked",
    shopId: state.shop.shopId,
    trade: state.shop.trade,
    jobType: input.jobType,
    urgency: input.urgency,
    problemSummary: input.problemSummary,
    fromPhone: normalizePhone(input.fromPhone),
    calledAtIso: input.calledAtIso,
    customerId: resolved.customer?.id,
    customerName: resolved.customerName,
    propertyId: resolved.property?.id,
    propertyAddress: resolved.propertyAddress,
    isExistingCustomer: resolved.isExistingCustomer,
    appointmentStartIso: offer.startIso,
    appointmentEndIso: offer.endIso,
    technicianId: offer.technicianId,
    technicianName: offer.technicianName,
    notes: [
      decision.reason,
      resolved.isExistingCustomer
        ? "Existing customer and property recognized from caller ID"
        : "New caller — contact and address captured on the call",
    ],
  };

  const next: ShopState = {
    ...state,
    customers: resolved.createdCustomer
      ? [...state.customers, resolved.createdCustomer]
      : state.customers,
    properties: resolved.createdProperty
      ? [...state.properties, resolved.createdProperty]
      : state.properties,
    slots: state.slots.map((s) =>
      s.id === slot.id ? { ...s, bookedJobId: jobId } : s,
    ),
    jobs: [job, ...state.jobs],
    calls: state.calls.map((c) =>
      c.id === input.callId ? { ...c, status: "booked", jobId } : c,
    ),
  };

  return { state: next, job };
}

export function applyEscalation(
  state: ShopState,
  input: EscalateInput,
): { state: ShopState; job: JobRecord } {
  const calledAt = new Date(input.calledAtIso);
  const afterHours = !isWithinBusinessHours(state.shop, calledAt);
  const resolved = resolveCustomerForJob(
    state,
    input.fromPhone,
    input.newCallerName,
    input.newCallerAddress,
  );

  const jobId = `job_${Date.now()}`;
  const escalateTo =
    input.requestHuman || afterHours ? "on_call_dispatcher" : "morning_office";

  const job: JobRecord = {
    id: jobId,
    callId: input.callId,
    createdAtIso: new Date().toISOString(),
    status: "escalated",
    shopId: state.shop.shopId,
    trade: state.shop.trade,
    jobType: input.jobType,
    urgency: input.urgency,
    problemSummary: input.problemSummary,
    fromPhone: normalizePhone(input.fromPhone),
    calledAtIso: input.calledAtIso,
    customerId: resolved.customer?.id,
    customerName: resolved.customerName,
    propertyId: resolved.property?.id,
    propertyAddress: resolved.propertyAddress,
    isExistingCustomer: resolved.isExistingCustomer,
    escalationReason: input.reason,
    escalateTo,
    notes: [
      input.reason,
      "Human must take this call per shop rules",
      `Route to ${escalateTo.replace(/_/g, " ")}`,
    ],
  };

  const next: ShopState = {
    ...state,
    customers: resolved.createdCustomer
      ? [...state.customers, resolved.createdCustomer]
      : state.customers,
    properties: resolved.createdProperty
      ? [...state.properties, resolved.createdProperty]
      : state.properties,
    jobs: [job, ...state.jobs],
    calls: state.calls.map((c) =>
      c.id === input.callId ? { ...c, status: "escalated", jobId } : c,
    ),
  };

  return { state: next, job };
}

export function applyNeedsFollowUp(
  state: ShopState,
  input: EscalateInput,
): { state: ShopState; job: JobRecord } {
  const resolved = resolveCustomerForJob(
    state,
    input.fromPhone,
    input.newCallerName,
    input.newCallerAddress,
  );
  const jobId = `job_${Date.now()}`;
  const job: JobRecord = {
    id: jobId,
    callId: input.callId,
    createdAtIso: new Date().toISOString(),
    status: "needs_follow_up",
    shopId: state.shop.shopId,
    trade: state.shop.trade,
    jobType: input.jobType,
    urgency: input.urgency,
    problemSummary: input.problemSummary,
    fromPhone: normalizePhone(input.fromPhone),
    calledAtIso: input.calledAtIso,
    customerId: resolved.customer?.id,
    customerName: resolved.customerName,
    propertyId: resolved.property?.id,
    propertyAddress: resolved.propertyAddress,
    isExistingCustomer: resolved.isExistingCustomer,
    notes: [input.reason, "Office should follow up at open"],
  };

  const next: ShopState = {
    ...state,
    customers: resolved.createdCustomer
      ? [...state.customers, resolved.createdCustomer]
      : state.customers,
    properties: resolved.createdProperty
      ? [...state.properties, resolved.createdProperty]
      : state.properties,
    jobs: [job, ...state.jobs],
    calls: state.calls.map((c) =>
      c.id === input.callId ? { ...c, status: "needs_follow_up", jobId } : c,
    ),
  };

  return { state: next, job };
}

export function describeAfterHoursRule(shop: ShopRules, at: Date, urgency: Urgency): string {
  const open = isWithinBusinessHours(shop, at);
  if (open) return "Within business hours";
  if (urgency === "emergency") {
    const { hour } = zonedParts(at, shop.timezone);
    if (hour >= shop.emergencyCutoffHour) {
      return `After hours · emergency past ${shop.emergencyCutoffHour}:00 cutoff → morning emergency slot`;
    }
    return "After hours · emergency → on-call window";
  }
  return "After hours · routine → wait until morning capacity";
}

// Re-export weekday helper for tests
export { WEEKDAYS };
