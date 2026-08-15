import { NextResponse } from "next/server";
import { z } from "zod";
import { loadState, saveState } from "@/lib/store";
import type { ShopRules, Technician } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  const state = loadState();
  return NextResponse.json({
    shop: state.shop,
    technicians: state.technicians,
  });
}

const PatchSchema = z.object({
  shop: z
    .object({
      name: z.string().optional(),
      emergencyCutoffHour: z.number().min(0).max(23).optional(),
      brandVoice: z.string().optional(),
      afterHoursGreeting: z.string().optional(),
      alwaysEscalateJobTypes: z.array(z.string()).optional(),
      escalateKeywords: z.array(z.string()).optional(),
      businessHours: z.record(z.any()).optional(),
      serviceArea: z
        .object({
          cities: z.array(z.string()),
          postalPrefixes: z.array(z.string()),
        })
        .optional(),
      faqs: z
        .array(
          z.object({
            id: z.string(),
            question: z.string(),
            answer: z.string(),
          }),
        )
        .optional(),
      jobTypes: z
        .array(
          z.object({
            id: z.string(),
            label: z.string(),
            defaultUrgency: z.enum(["emergency", "same_day", "routine"]),
            alwaysEscalate: z.boolean().optional(),
          }),
        )
        .optional(),
      routineSlotMinutes: z.number().optional(),
      emergencySlotMinutes: z.number().optional(),
    })
    .optional(),
  technicians: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        trades: z.array(z.string()),
        onCall: z.boolean(),
        active: z.boolean(),
      }),
    )
    .optional(),
});

export async function PUT(request: Request) {
  const body = PatchSchema.parse(await request.json());
  let state = loadState();
  if (body.shop) {
    state = {
      ...state,
      shop: { ...state.shop, ...body.shop } as ShopRules,
    };
  }
  if (body.technicians) {
    state = {
      ...state,
      technicians: body.technicians as Technician[],
    };
  }
  saveState(state);
  return NextResponse.json({ ok: true, shop: state.shop, technicians: state.technicians });
}
