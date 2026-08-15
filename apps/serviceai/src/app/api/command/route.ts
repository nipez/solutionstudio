import { NextResponse } from "next/server";
import { z } from "zod";
import { setHumanTakeover } from "@/lib/conversations";
import { loadState, saveState } from "@/lib/store";

export const runtime = "nodejs";

/** Unified Command Center inbox. */
export async function GET() {
  const state = loadState();
  const inbox = state.conversations
    .map((c) => {
      const job = state.jobs.find((j) => j.id === c.jobId) ??
        state.jobs.find((j) => j.conversationId === c.id);
      const crm = job?.crmRecordId
        ? state.crmRecords.find((r) => r.id === job.crmRecordId)
        : state.crmRecords.find((r) => r.jobId === job?.id);
      return {
        conversation: c,
        job: job ?? null,
        crm: crm ?? null,
        preview: c.messages[c.messages.length - 1]?.body?.slice(0, 120) ?? "",
      };
    })
    .sort(
      (a, b) =>
        +new Date(b.conversation.updatedAtIso) - +new Date(a.conversation.updatedAtIso),
    );

  return NextResponse.json({
    inbox,
    counts: {
      conversations: state.conversations.length,
      jobs: state.jobs.length,
      crm: state.crmRecords.length,
    },
  });
}

const ActionSchema = z.object({
  conversationId: z.string(),
  action: z.enum(["takeover", "release", "note"]),
  note: z.string().optional(),
});

export async function POST(request: Request) {
  const input = ActionSchema.parse(await request.json());
  let state = loadState();

  if (input.action === "takeover") {
    state = setHumanTakeover(state, input.conversationId, true, input.note);
  } else if (input.action === "release") {
    state = setHumanTakeover(state, input.conversationId, false);
  } else if (input.action === "note") {
    state = setHumanTakeover(
      state,
      input.conversationId,
      state.conversations.find((c) => c.id === input.conversationId)?.humanTakeover ?? false,
      input.note ?? "Office note",
    );
  }

  saveState(state);
  const conversation = state.conversations.find((c) => c.id === input.conversationId);
  return NextResponse.json({ conversation });
}
