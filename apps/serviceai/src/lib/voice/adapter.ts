/**
 * Thin voice-provider adapter.
 *
 * Real Twilio / Vapi webhooks can map into VoiceWebhookEvent without
 * changing the booking engine. The simulated call UI uses the same
 * evaluate → book / escalate path via /api/demo/*.
 */

import { z } from "zod";
import type { IncomingCallContext, Urgency } from "../types";

export const VoiceWebhookSchema = z.object({
  provider: z.enum(["stub", "twilio", "vapi"]).default("stub"),
  event: z.enum([
    "call.started",
    "call.speech",
    "call.intent",
    "call.ended",
  ]),
  callId: z.string().optional(),
  fromPhone: z.string().min(7),
  toPhone: z.string().optional(),
  calledAtIso: z.string().optional(),
  /** Free-form ASR / caller utterance for stub & later providers. */
  speechText: z.string().optional(),
  /** Structured intent once NLU (or the sim UI) fills it in. */
  intent: z
    .object({
      jobType: z.string(),
      urgency: z.enum(["emergency", "same_day", "routine"]),
      problemSummary: z.string(),
      requestHuman: z.boolean().optional(),
      newCallerName: z.string().optional(),
      newCallerAddress: z.string().optional(),
    })
    .optional(),
});

export type VoiceWebhookEvent = z.infer<typeof VoiceWebhookSchema>;

/** Map a provider webhook (or stub payload) into booking-engine context. */
export function toIncomingCallContext(
  event: VoiceWebhookEvent,
  fallbackNowIso: string,
): IncomingCallContext | null {
  if (!event.intent) return null;
  return {
    fromPhone: event.fromPhone,
    calledAtIso: event.calledAtIso ?? fallbackNowIso,
    problemSummary: event.intent.problemSummary,
    jobType: event.intent.jobType,
    urgency: event.intent.urgency as Urgency,
    newCallerName: event.intent.newCallerName,
    newCallerAddress: event.intent.newCallerAddress,
    requestHuman: event.intent.requestHuman,
  };
}

/**
 * Example Twilio-shaped body → our event.
 * Keep this mapping tiny; expand when a real number is wired.
 */
export function fromTwilioLike(body: Record<string, unknown>): VoiceWebhookEvent {
  return VoiceWebhookSchema.parse({
    provider: "twilio",
    event: "call.intent",
    callId: String(body.CallSid ?? ""),
    fromPhone: String(body.From ?? ""),
    toPhone: String(body.To ?? ""),
    speechText: body.SpeechResult ? String(body.SpeechResult) : undefined,
    intent: body.intent as VoiceWebhookEvent["intent"],
  });
}

/**
 * Example Vapi-shaped body → our event.
 */
export function fromVapiLike(body: Record<string, unknown>): VoiceWebhookEvent {
  const call = (body.call as Record<string, unknown> | undefined) ?? {};
  const customer = (call.customer as Record<string, unknown> | undefined) ?? {};
  return VoiceWebhookSchema.parse({
    provider: "vapi",
    event: "call.intent",
    callId: String(call.id ?? body.message ?? ""),
    fromPhone: String(customer.number ?? body.fromPhone ?? ""),
    intent: body.intent as VoiceWebhookEvent["intent"],
    calledAtIso: body.calledAtIso ? String(body.calledAtIso) : undefined,
  });
}
