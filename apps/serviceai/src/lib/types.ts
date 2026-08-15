/** Domain types for the Service AI platform (Hatch-like surfaces on one booking core). */

export type Trade = "hvac" | "plumbing" | "electrical" | "garage_door" | "roofing";

export type Urgency = "emergency" | "same_day" | "routine";

export type CallOutcome = "booked" | "escalated" | "needs_follow_up";

export type JobStatus = CallOutcome | "in_progress";

export type Channel = "voice" | "sms" | "email" | "form";

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

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export interface JobTypeDef {
  id: string;
  label: string;
  defaultUrgency: Urgency;
  alwaysEscalate?: boolean;
}

export interface ShopRules {
  shopId: string;
  name: string;
  trade: Trade;
  timezone: string;
  businessHours: Record<Weekday, BusinessHoursWindow | null>;
  /** At/after this local hour, emergency overnight slots close → morning emergency. */
  emergencyCutoffHour: number;
  alwaysEscalateJobTypes: string[];
  escalateKeywords: string[];
  routineSlotMinutes: number;
  emergencySlotMinutes: number;
  /** Knowledge Engine additions */
  brandVoice: string;
  afterHoursGreeting: string;
  serviceArea: { cities: string[]; postalPrefixes: string[] };
  faqs: FaqItem[];
  jobTypes: JobTypeDef[];
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
  phone: string;
  email?: string;
  propertyIds: string[];
  notes?: string;
}

export interface Technician {
  id: string;
  name: string;
  trades: Trade[];
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
  fromPhone: string;
  calledAtIso: string;
  problemSummary: string;
  jobType: string;
  urgency: Urgency;
  newCallerName?: string;
  newCallerAddress?: string;
  requestHuman?: boolean;
  channel?: Channel;
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
  conversationId?: string;
  channel?: Channel;
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
  conversationId?: string;
  channel?: Channel;
}

export interface JobRecord {
  id: string;
  callId: string;
  conversationId?: string;
  createdAtIso: string;
  status: JobStatus;
  shopId: string;
  trade: Trade;
  jobType: string;
  urgency: Urgency;
  problemSummary: string;
  fromPhone: string;
  calledAtIso: string;
  channel?: Channel;
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
  crmRecordId?: string;
}

export interface CallRecord {
  id: string;
  startedAtIso: string;
  fromPhone: string;
  channel: "sim" | "voice_webhook" | "sms" | "email";
  status: JobStatus | "in_progress";
  jobId?: string;
  conversationId?: string;
  transcript: { role: "assistant" | "caller" | "system"; text: string; atIso: string }[];
}

export type MessageRole = "customer" | "ai" | "human" | "system";

export interface ConversationMessage {
  id: string;
  role: MessageRole;
  channel: Channel;
  body: string;
  atIso: string;
  meta?: Record<string, string>;
}

export interface Conversation {
  id: string;
  channel: Channel;
  fromPhone: string;
  fromEmail?: string;
  fromName?: string;
  subject?: string;
  status: JobStatus | "in_progress";
  jobId?: string;
  customerId?: string;
  humanTakeover: boolean;
  createdAtIso: string;
  updatedAtIso: string;
  messages: ConversationMessage[];
  journeyRunId?: string;
}

export type JourneyChannel = "voice" | "sms" | "email" | "system";

export interface JourneyStep {
  id: string;
  channel: JourneyChannel;
  /** Template with {{customerName}}, {{appointment}}, {{technician}} */
  template: string;
  delayMinutes: number;
  action?: "sms_confirm" | "sms_reminder" | "email_followup" | "offer_or_book" | "noop";
}

export interface JourneyDefinition {
  id: string;
  name: string;
  description: string;
  trigger:
    | "after_hours_emergency_booked"
    | "new_lead_inbound_sms"
    | "manual";
  enabled: boolean;
  steps: JourneyStep[];
}

export interface JourneyRunLog {
  atIso: string;
  stepId: string;
  detail: string;
}

export interface JourneyRun {
  id: string;
  journeyId: string;
  conversationId: string;
  jobId?: string;
  status: "running" | "completed" | "stopped";
  stepIndex: number;
  startedAtIso: string;
  nextStepAtIso?: string;
  log: JourneyRunLog[];
}

/** In-app CRM stub records (Data Bridge). */
export interface CrmRecord {
  id: string;
  externalSystem: "in_app_stub";
  customerId: string;
  customerName: string;
  phone: string;
  email?: string;
  propertyId?: string;
  propertyAddress?: string;
  jobId: string;
  jobType: string;
  urgency: Urgency;
  status: JobStatus;
  appointmentStartIso?: string;
  appointmentEndIso?: string;
  technicianName?: string;
  writtenAtIso: string;
  notes: string[];
}

export interface ShopState {
  shop: ShopRules;
  customers: Customer[];
  properties: Property[];
  technicians: Technician[];
  slots: CalendarSlot[];
  jobs: JobRecord[];
  calls: CallRecord[];
  conversations: Conversation[];
  journeys: JourneyDefinition[];
  journeyRuns: JourneyRun[];
  crmRecords: CrmRecord[];
}
