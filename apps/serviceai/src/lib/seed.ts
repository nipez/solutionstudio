import type {
  CalendarSlot,
  Customer,
  Property,
  ShopRules,
  ShopState,
  Technician,
} from "./types";

/** Summit Comfort HVAC — seeded demo shop matching the Service AI hero scenario. */
export const SUMMIT_SHOP: ShopRules = {
  shopId: "summit-comfort-hvac",
  name: "Summit Comfort HVAC",
  trade: "hvac",
  timezone: "America/New_York",
  businessHours: {
    monday: { open: "08:00", close: "17:00" },
    tuesday: { open: "08:00", close: "17:00" },
    wednesday: { open: "08:00", close: "17:00" },
    thursday: { open: "08:00", close: "17:00" },
    friday: { open: "08:00", close: "17:00" },
    saturday: { open: "09:00", close: "13:00" },
    sunday: null,
  },
  emergencyCutoffHour: 21,
  alwaysEscalateJobTypes: [
    "gas_smell",
    "carbon_monoxide",
    "electrical_fire_risk",
    "flooding",
  ],
  escalateKeywords: [
    "gas smell",
    "smell gas",
    "carbon monoxide",
    "co detector",
    "speak to someone",
    "talk to a person",
    "real person",
    "human",
  ],
  routineSlotMinutes: 90,
  emergencySlotMinutes: 60,
};

export const SEED_PROPERTIES: Property[] = [
  {
    id: "prop_oak_ridge",
    addressLine1: "1847 Oak Ridge Dr",
    city: "Columbus",
    state: "OH",
    postalCode: "43215",
    notes: "Carrier furnace + AC · last tune-up Mar 2025 · filter size 16x25x1",
  },
  {
    id: "prop_maple_ln",
    addressLine1: "92 Maple Lane",
    city: "Dublin",
    state: "OH",
    postalCode: "43017",
    notes: "Trane heat pump · maintenance plan",
  },
  {
    id: "prop_high_st",
    addressLine1: "410 High St #2B",
    city: "Columbus",
    state: "OH",
    postalCode: "43215",
    notes: "Condo · rooftop condenser access via lockbox",
  },
];

export const SEED_CUSTOMERS: Customer[] = [
  {
    id: "cust_maria",
    name: "Maria Delgado",
    phone: "+15550120001",
    email: "maria.delgado@example.com",
    propertyIds: ["prop_oak_ridge"],
    notes: "Preferred contact: text then call. Has two kids at home.",
  },
  {
    id: "cust_james",
    name: "James Chen",
    phone: "+15550120002",
    email: "james.chen@example.com",
    propertyIds: ["prop_maple_ln"],
  },
  {
    id: "cust_priya",
    name: "Priya Nair",
    phone: "+15550120003",
    propertyIds: ["prop_high_st"],
  },
];

export const SEED_TECHNICIANS: Technician[] = [
  {
    id: "tech_alex",
    name: "Alex Rivera",
    trades: ["hvac"],
    onCall: true,
    active: true,
  },
  {
    id: "tech_sam",
    name: "Sam Ortiz",
    trades: ["hvac"],
    onCall: false,
    active: true,
  },
  {
    id: "tech_jordan",
    name: "Jordan Lee",
    trades: ["hvac"],
    onCall: true,
    active: true,
  },
];

/** Default demo "now": Thursday Jan 15, 2026 · 9:48 PM Eastern. */
export const DEFAULT_DEMO_NOW_ISO = "2026-01-15T21:48:00-05:00";

function isoAt(
  date: string,
  hour: number,
  minute: number,
  durationMinutes: number,
): { startIso: string; endIso: string } {
  const start = new Date(`${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-05:00`);
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

/** Open capacity around the demo night + next business morning. */
export function buildSeedSlots(): CalendarSlot[] {
  const slots: CalendarSlot[] = [];
  let n = 0;
  const push = (
    date: string,
    hour: number,
    minute: number,
    duration: number,
    technicianId: string,
    kind: CalendarSlot["kind"],
  ) => {
    const { startIso, endIso } = isoAt(date, hour, minute, duration);
    slots.push({
      id: `slot_${++n}`,
      startIso,
      endIso,
      technicianId,
      kind,
    });
  };

  // Demo night Thu Jan 15 — on-call emergency windows before cutoff
  push("2026-01-15", 20, 0, 60, "tech_alex", "emergency");
  push("2026-01-15", 21, 0, 60, "tech_jordan", "emergency");
  // Past cutoff (9:48 PM) — these evening slots are no longer offerable for new emergencies

  // Fri Jan 16 — first emergency morning + routine capacity
  push("2026-01-16", 8, 0, 60, "tech_alex", "emergency");
  push("2026-01-16", 8, 0, 90, "tech_sam", "routine");
  push("2026-01-16", 9, 30, 90, "tech_alex", "routine");
  push("2026-01-16", 9, 30, 90, "tech_sam", "routine");
  push("2026-01-16", 11, 0, 90, "tech_jordan", "routine");
  push("2026-01-16", 13, 0, 90, "tech_sam", "routine");
  push("2026-01-16", 14, 30, 90, "tech_alex", "routine");

  // Sat Jan 17 — lighter crew (shop opens 9:00)
  push("2026-01-17", 9, 0, 90, "tech_sam", "routine");
  push("2026-01-17", 10, 30, 90, "tech_sam", "routine");
  push("2026-01-17", 9, 0, 60, "tech_jordan", "emergency");

  return slots;
}

export function createSeedState(): ShopState {
  return {
    shop: SUMMIT_SHOP,
    customers: structuredClone(SEED_CUSTOMERS),
    properties: structuredClone(SEED_PROPERTIES),
    technicians: structuredClone(SEED_TECHNICIANS),
    slots: buildSeedSlots(),
    jobs: [],
    calls: [],
  };
}

/** Canonical demo caller for the 9:48 PM hero path. */
export const DEMO_EXISTING_CUSTOMER_PHONE = "+15550120001";
export const DEMO_NEW_CALLER_PHONE = "+15550998877";
