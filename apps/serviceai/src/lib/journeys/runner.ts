import { appendConversationMessage } from "../conversations";
import { sendBookingFollowUpEmail } from "../email/adapter";
import { defaultCrmAdapter } from "../bridge/crm";
import {
  applyBooking,
  evaluateCall,
  isWithinBusinessHours,
  normalizePhone,
} from "../booking/engine";
import { parseSmsIntent } from "../messaging/intent";
import type {
  JobRecord,
  JourneyDefinition,
  JourneyRun,
  ShopState,
} from "../types";

function renderTemplate(
  template: string,
  vars: Record<string, string | undefined>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "");
}

function formatAppt(state: ShopState, job?: JobRecord): string {
  if (!job?.appointmentStartIso) return "your appointment";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: state.shop.timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(job.appointmentStartIso));
}

export function startJourney(
  state: ShopState,
  journeyId: string,
  conversationId: string,
  jobId: string | undefined,
  atIso: string,
): { state: ShopState; run: JourneyRun } {
  const journey = state.journeys.find((j) => j.id === journeyId);
  if (!journey || !journey.enabled) {
    throw new Error(`Journey ${journeyId} not found or disabled`);
  }
  const firstDelay = journey.steps[0]?.delayMinutes ?? 0;
  const run: JourneyRun = {
    id: `jrun_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    journeyId,
    conversationId,
    jobId,
    status: "running",
    stepIndex: 0,
    startedAtIso: atIso,
    nextStepAtIso: new Date(new Date(atIso).getTime() + firstDelay * 60_000).toISOString(),
    log: [
      {
        atIso,
        stepId: "start",
        detail: `Started journey "${journey.name}"`,
      },
    ],
  };
  const next: ShopState = {
    ...state,
    journeyRuns: [run, ...state.journeyRuns],
    conversations: state.conversations.map((c) =>
      c.id === conversationId ? { ...c, journeyRunId: run.id } : c,
    ),
  };
  return { state: next, run };
}

export function findJourneyByTrigger(
  state: ShopState,
  trigger: JourneyDefinition["trigger"],
): JourneyDefinition | undefined {
  return state.journeys.find((j) => j.enabled && j.trigger === trigger);
}

/** Advance one due step (or force the current step for demo). */
export function advanceJourney(
  state: ShopState,
  runId: string,
  nowIso: string,
  opts?: { force?: boolean; smsBodyForOffer?: string },
): { state: ShopState; run: JourneyRun; completedStep: boolean } {
  const run = state.journeyRuns.find((r) => r.id === runId);
  if (!run || run.status !== "running") {
    throw new Error("Journey run not active");
  }
  const journey = state.journeys.find((j) => j.id === run.journeyId);
  if (!journey) throw new Error("Journey definition missing");

  const step = journey.steps[run.stepIndex];
  if (!step) {
    const completed: JourneyRun = { ...run, status: "completed", nextStepAtIso: undefined };
    return {
      state: {
        ...state,
        journeyRuns: state.journeyRuns.map((r) => (r.id === runId ? completed : r)),
      },
      run: completed,
      completedStep: false,
    };
  }

  if (!opts?.force && run.nextStepAtIso && new Date(nowIso) < new Date(run.nextStepAtIso)) {
    return { state, run, completedStep: false };
  }

  const job = run.jobId ? state.jobs.find((j) => j.id === run.jobId) : undefined;
  const conv = state.conversations.find((c) => c.id === run.conversationId);
  const vars = {
    customerName: job?.customerName ?? conv?.fromName ?? "there",
    appointment: formatAppt(state, job),
    technician: job?.technicianName ?? "our tech",
  };

  let next = state;
  const body = renderTemplate(step.template, vars);

  if (step.action === "sms_confirm" || step.action === "sms_reminder" || step.channel === "sms") {
    if (step.action !== "noop" || step.channel === "sms") {
      next = appendConversationMessage(next, run.conversationId, "ai", body, "sms", nowIso);
    }
  }

  if (step.action === "email_followup" || step.channel === "email") {
    if (job) {
      const emailed = sendBookingFollowUpEmail(next, job, nowIso);
      next = emailed.state;
    } else {
      next = appendConversationMessage(next, run.conversationId, "ai", body, "email", nowIso);
    }
  }

  if (step.action === "noop" && step.channel === "system") {
    next = appendConversationMessage(next, run.conversationId, "system", body, "voice", nowIso);
  }

  if (step.action === "offer_or_book") {
    const phone = conv?.fromPhone ?? job?.fromPhone;
    if (phone) {
      const intentText =
        opts?.smsBodyForOffer ??
        [...(conv?.messages ?? [])]
          .reverse()
          .find((m) => m.role === "customer")?.body ??
        "tune-up";
      const ctx = parseSmsIntent(intentText, phone, nowIso, {
        newCallerName: conv?.fromName,
      });
      // Journey demo: ensure we can book routine new leads without stalling on identity
      if (!ctx.newCallerName) {
        ctx.newCallerName = conv?.fromName ?? "New lead";
      }
      if (ctx.urgency === "routine" && !ctx.newCallerAddress) {
        ctx.newCallerAddress = "100 Demo St, Columbus, OH 43215";
      }
      const decision = evaluateCall(next, ctx);
      if (decision.action === "offer_slots" && decision.offers[0]) {
        const callId = `call_journey_${Date.now()}`;
        next = {
          ...next,
          calls: [
            {
              id: callId,
              startedAtIso: nowIso,
              fromPhone: normalizePhone(phone),
              channel: "sms",
              status: "in_progress",
              conversationId: run.conversationId,
              transcript: [],
            },
            ...next.calls,
          ],
        };
        const booked = applyBooking(next, {
          callId,
          slotId: decision.offers[0].slotId,
          fromPhone: phone,
          calledAtIso: nowIso,
          problemSummary: ctx.problemSummary,
          jobType: ctx.jobType,
          urgency: ctx.urgency,
          newCallerName: ctx.newCallerName,
          newCallerAddress: ctx.newCallerAddress,
          conversationId: run.conversationId,
          channel: "sms",
        });
        const crm = defaultCrmAdapter.writeJob(booked.state, booked.job);
        next = crm.state;
        next = appendConversationMessage(
          next,
          run.conversationId,
          "ai",
          `Booked ${decision.offers[0].label} with ${decision.offers[0].technicianName}.`,
          "sms",
          nowIso,
        );
        run.jobId = booked.job.id;
      } else if (decision.action === "escalate") {
        next = appendConversationMessage(
          next,
          run.conversationId,
          "ai",
          `I need to connect you with our office: ${decision.reason}`,
          "sms",
          nowIso,
        );
      } else {
        next = appendConversationMessage(
          next,
          run.conversationId,
          "ai",
          decision.reason,
          "sms",
          nowIso,
        );
      }
    }
  }

  const nextIndex = run.stepIndex + 1;
  const nextStep = journey.steps[nextIndex];
  const updated: JourneyRun = {
    ...run,
    stepIndex: nextIndex,
    status: nextStep ? "running" : "completed",
    nextStepAtIso: nextStep
      ? new Date(new Date(nowIso).getTime() + nextStep.delayMinutes * 60_000).toISOString()
      : undefined,
    log: [
      ...run.log,
      { atIso: nowIso, stepId: step.id, detail: `Completed: ${step.id} (${step.action ?? step.channel})` },
    ],
  };

  next = {
    ...next,
    journeyRuns: next.journeyRuns.map((r) => (r.id === runId ? updated : r)),
  };

  return { state: next, run: updated, completedStep: true };
}

/** Run all remaining steps immediately (demo). */
export function runJourneyToCompletion(
  state: ShopState,
  runId: string,
  nowIso: string,
  smsBodyForOffer?: string,
): { state: ShopState; run: JourneyRun } {
  let next = state;
  let guard = 0;
  let run = next.journeyRuns.find((r) => r.id === runId)!;
  while (run.status === "running" && guard < 20) {
    const result = advanceJourney(next, runId, nowIso, {
      force: true,
      smsBodyForOffer,
    });
    next = result.state;
    run = result.run;
    if (!result.completedStep && run.status === "running") break;
    guard += 1;
  }
  return { state: next, run };
}

export function maybeStartAfterHoursEmergencyJourney(
  state: ShopState,
  job: JobRecord,
  conversationId: string,
  atIso: string,
): { state: ShopState; run?: JourneyRun } {
  if (job.status !== "booked" || job.urgency !== "emergency") {
    return { state };
  }
  const calledAt = new Date(job.calledAtIso);
  if (isWithinBusinessHours(state.shop, calledAt)) return { state };

  const journey = findJourneyByTrigger(state, "after_hours_emergency_booked");
  if (!journey) return { state };
  return startJourney(state, journey.id, conversationId, job.id, atIso);
}
