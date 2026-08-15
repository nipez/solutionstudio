import { NextResponse } from "next/server";
import { z } from "zod";
import {
  advanceJourney,
  runJourneyToCompletion,
  startJourney,
} from "@/lib/journeys/runner";
import { getDemoNow } from "@/lib/booking/engine";
import { createConversation } from "@/lib/conversations";
import { loadState, saveState } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  const state = loadState();
  return NextResponse.json({
    journeys: state.journeys,
    runs: state.journeyRuns,
  });
}

const ActionSchema = z.object({
  action: z.enum([
    "toggle",
    "advance",
    "run_to_completion",
    "start_demo_after_hours",
    "start_demo_speed_to_lead",
    "update_steps",
  ]),
  journeyId: z.string().optional(),
  runId: z.string().optional(),
  enabled: z.boolean().optional(),
  nowIso: z.string().optional(),
  smsBody: z.string().optional(),
  steps: z
    .array(
      z.object({
        id: z.string(),
        channel: z.enum(["voice", "sms", "email", "system"]),
        template: z.string(),
        delayMinutes: z.number(),
        action: z
          .enum([
            "sms_confirm",
            "sms_reminder",
            "email_followup",
            "offer_or_book",
            "noop",
          ])
          .optional(),
      }),
    )
    .optional(),
});

export async function POST(request: Request) {
  const input = ActionSchema.parse(await request.json());
  const nowIso = input.nowIso ?? getDemoNow().toISOString();
  let state = loadState();

  if (input.action === "toggle" && input.journeyId) {
    state = {
      ...state,
      journeys: state.journeys.map((j) =>
        j.id === input.journeyId
          ? { ...j, enabled: input.enabled ?? !j.enabled }
          : j,
      ),
    };
    saveState(state);
    return NextResponse.json({ journeys: state.journeys });
  }

  if (input.action === "update_steps" && input.journeyId && input.steps) {
    state = {
      ...state,
      journeys: state.journeys.map((j) =>
        j.id === input.journeyId ? { ...j, steps: input.steps! } : j,
      ),
    };
    saveState(state);
    return NextResponse.json({ journey: state.journeys.find((j) => j.id === input.journeyId) });
  }

  if (input.action === "advance" && input.runId) {
    const result = advanceJourney(state, input.runId, nowIso, { force: true });
    saveState(result.state);
    return NextResponse.json({ run: result.run });
  }

  if (input.action === "run_to_completion" && input.runId) {
    const result = runJourneyToCompletion(
      state,
      input.runId,
      nowIso,
      input.smsBody,
    );
    saveState(result.state);
    return NextResponse.json({ run: result.run });
  }

  if (input.action === "start_demo_after_hours") {
    // Expect a booked emergency job already; if not, tell the UI to run voice first.
    const job = state.jobs.find(
      (j) => j.status === "booked" && j.urgency === "emergency" && j.conversationId,
    );
    if (!job?.conversationId) {
      return NextResponse.json(
        {
          error:
            "Book an after-hours emergency on Voice first (Maria 9:48 PM), then run this journey — or it auto-starts on book.",
        },
        { status: 400 },
      );
    }
    const existing = state.journeyRuns.find(
      (r) => r.jobId === job.id && r.journeyId === "journey_after_hours_emergency",
    );
    if (existing) {
      const finished = runJourneyToCompletion(state, existing.id, nowIso);
      saveState(finished.state);
      return NextResponse.json({ run: finished.run, reused: true });
    }
    const started = startJourney(
      state,
      "journey_after_hours_emergency",
      job.conversationId,
      job.id,
      nowIso,
    );
    const finished = runJourneyToCompletion(started.state, started.run.id, nowIso);
    saveState(finished.state);
    return NextResponse.json({ run: finished.run });
  }

  if (input.action === "start_demo_speed_to_lead") {
    const conv = createConversation(state, {
      channel: "sms",
      fromPhone: "+15550998877",
      fromName: "Chris Alvarez",
      atIso: nowIso,
      openingMessage: {
        role: "customer",
        body: input.smsBody ?? "Hi — need a furnace tune-up this week",
        channel: "sms",
      },
    });
    state = conv.state;
    const started = startJourney(
      state,
      "journey_speed_to_lead",
      conv.conversation.id,
      undefined,
      nowIso,
    );
    const finished = runJourneyToCompletion(
      started.state,
      started.run.id,
      nowIso,
      input.smsBody ?? "Hi — need a furnace tune-up this week",
    );
    saveState(finished.state);
    return NextResponse.json({
      run: finished.run,
      conversationId: conv.conversation.id,
      job: finished.state.jobs.find((j) => j.conversationId === conv.conversation.id),
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
