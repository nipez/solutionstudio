/** Domain types for the after-hours booking loop. */

export type Trade = "hvac" | "plumbing" | "electrical" | "garage_door" | "roofing";

export type Urgency = "emergency" | "same_day" | "routine";

export type CallOutcome = "booked" | "escalated" | "needs_follow_up";

export type JobStatus = CallOutcome;

export type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export interface BusinessHoursWindow {
  open: string; // "HH:MM" 24h local
  close: string;
}

export interface ShopRules {
  shopId: string;
  name: string;
  trade: Trade;
  timezone: string;
  businessHours: Record<Weekday, BusinessHoursWindow | null>;
  /** After this local hour, emergency overnight slots are closed; offer next-morning emergency. */
  emergencyCutoffHour: number;
  /** Job types that always escalate to a human. */
  alwaysEscalateJobTypes: string[];
  /** Keywords / phrases that force human escalation. */
  escalateKeywords: string[];
  /** Minutes reserved for a routine appointment. */
  routineSlotMinutes: number;
  /** Minutes reserved for an emergency appointment. */
  emergencySlotMinutes: number;
}

export interface Property {
  id: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  notes?: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string; // E.164-ish, digits ok
  email?: string;
  propertyIds: string[];
  notes?: string;
}

export interface Technician {
  id: string;
  name: string;
  trades: Trade[];
  /** Can take after-hours / on-call emergencies. */
  onCall: boolean;
  active: boolean;
}

export interface CalendarSlot {
  id: string;
  startIso: string;
  endIso: string;
  technicianId: string;
  kind: "routine" | "emergency" | "blocked";
  bookedJobId?: string;
}

export interface IncomingCallContext {
  /** Caller ID as received from the voice provider / sim UI. */
  fromPhone: string;
  /** Wall clock for the call (demo can freeze at 9:48 PM). */
  calledAtIso: string;
  /** Free-text description of the problem. */
  problemSummary: string;
  /** Caller-stated or inferred job type. */
  jobType: string;
  urgency: Urgency;
  /** Optional new-caller details when phone is unknown. */
  newCallerName?: string;
  newCallerAddress?: string;
  /** Caller explicitly asks for a person. */
  requestHuman?: boolean;
}

export interface IdentifiedCaller {
  kind: "existing" | "new";
  customer?: Customer;
  property?: Property;
  displayName: string;
}

export interface SlotOffer {
  slotId: string;
  startIso: string;
  endIso: string;
  technicianId: string;
  technicianName: string;
  label: string;
  kind: "routine" | "emergency";
}

export type BookingDecision =
  | {
      action: "offer_slots";
      reason: string;
      caller: IdentifiedCaller;
      urgency: Urgency;
      jobType: string;
      offers: SlotOffer[];
    }
  | {
      action: "escalate";
      reason: string;
      caller: IdentifiedCaller;
      urgency: Urgency;
      jobType: string;
      escalateTo: "on_call_dispatcher" | "morning_office";
    }
  | {
      action: "needs_follow_up";
      reason: string;
      caller: IdentifiedCaller;
      urgency: Urgency;
      jobType: string;
    };

export interface ConfirmBookingInput {
  callId: string;
  slotId: string;
  problemSummary: string;
  jobType: string;
  urgency: Urgency;
  fromPhone: string;
  calledAtIso: string;
  newCallerName?: string;
  newCallerAddress?: string;
}

export interface EscalateInput {
  callId: string;
  problemSummary: string;
  jobType: string;
  urgency: Urgency;
  fromPhone: string;
  calledAtIso: string;
  reason: string;
  newCallerName?: string;
  newCallerAddress?: string;
  requestHuman?: boolean;
}

export interface JobRecord {
  id: string;
  callId: string;
  createdAtIso: string;
  status: JobStatus;
  shopId: string;
  trade: Trade;
  jobType: string;
  urgency: Urgency;
  problemSummary: string;
  fromPhone: string;
  calledAtIso: string;
  customerId?: string;
  customerName: string;
  propertyId?: string;
  propertyAddress?: string;
  isExistingCustomer: boolean;
  appointmentStartIso?: string;
  appointmentEndIso?: string;
  technicianId?: string;
  technicianName?: string;
  escalationReason?: string;
  escalateTo?: "on_call_dispatcher" | "morning_office";
  notes: string[];
}

export interface CallRecord {
  id: string;
  startedAtIso: string;
  fromPhone: string;
  channel: "sim" | "voice_webhook";
  status: JobStatus | "in_progress";
  jobId?: string;
  transcript: { role: "assistant" | "caller" | "system"; text: string; atIso: string }[];
}

export interface ShopState {
  shop: ShopRules;
  customers: Customer[];
  properties: Property[];
  technicians: Technician[];
  slots: CalendarSlot[];
  jobs: JobRecord[];
  calls: CallRecord[];
}
