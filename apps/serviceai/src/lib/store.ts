import fs from "node:fs";
import path from "node:path";
import { createSeedState, SEED_JOURNEYS, SUMMIT_SHOP } from "./seed";
import type { CallRecord, ShopRules, ShopState } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const STATE_FILE = path.join(DATA_DIR, "shop-state.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/** Merge older JSON files with new platform fields. */
export function migrateState(raw: Partial<ShopState>): ShopState {
  const seeded = createSeedState();
  const shop: ShopRules = {
    ...SUMMIT_SHOP,
    ...(raw.shop ?? {}),
    brandVoice: raw.shop?.brandVoice ?? SUMMIT_SHOP.brandVoice,
    afterHoursGreeting: raw.shop?.afterHoursGreeting ?? SUMMIT_SHOP.afterHoursGreeting,
    serviceArea: raw.shop?.serviceArea ?? SUMMIT_SHOP.serviceArea,
    faqs: raw.shop?.faqs?.length ? raw.shop.faqs : SUMMIT_SHOP.faqs,
    jobTypes: raw.shop?.jobTypes?.length ? raw.shop.jobTypes : SUMMIT_SHOP.jobTypes,
    businessHours: raw.shop?.businessHours ?? SUMMIT_SHOP.businessHours,
  };

  return {
    shop,
    customers: raw.customers ?? seeded.customers,
    properties: raw.properties ?? seeded.properties,
    technicians: raw.technicians ?? seeded.technicians,
    slots: raw.slots ?? seeded.slots,
    jobs: raw.jobs ?? [],
    calls: raw.calls ?? [],
    conversations: raw.conversations ?? [],
    journeys: raw.journeys?.length ? raw.journeys : structuredClone(SEED_JOURNEYS),
    journeyRuns: raw.journeyRuns ?? [],
    crmRecords: raw.crmRecords ?? [],
  };
}

export function loadState(): ShopState {
  ensureDataDir();
  if (!fs.existsSync(STATE_FILE)) {
    const seeded = createSeedState();
    saveState(seeded);
    return seeded;
  }
  const parsed = JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) as Partial<ShopState>;
  const migrated = migrateState(parsed);
  // Persist migration once if needed
  if (
    !parsed.conversations ||
    !parsed.journeys ||
    !parsed.crmRecords ||
    !parsed.shop?.brandVoice
  ) {
    saveState(migrated);
  }
  return migrated;
}

export function saveState(state: ShopState): void {
  ensureDataDir();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

export function resetState(): ShopState {
  const seeded = createSeedState();
  saveState(seeded);
  return seeded;
}

export function startCall(
  state: ShopState,
  fromPhone: string,
  channel: CallRecord["channel"],
  startedAtIso: string,
  conversationId?: string,
): { state: ShopState; call: CallRecord } {
  const call: CallRecord = {
    id: `call_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    startedAtIso,
    fromPhone,
    channel,
    status: "in_progress",
    conversationId,
    transcript: [
      {
        role: "system",
        text: `Inbound ${channel} from ${fromPhone}`,
        atIso: startedAtIso,
      },
    ],
  };
  const next = { ...state, calls: [call, ...state.calls] };
  return { state: next, call };
}

export function appendTranscript(
  state: ShopState,
  callId: string,
  role: CallRecord["transcript"][number]["role"],
  text: string,
): ShopState {
  const atIso = new Date().toISOString();
  return {
    ...state,
    calls: state.calls.map((c) =>
      c.id === callId
        ? { ...c, transcript: [...c.transcript, { role, text, atIso }] }
        : c,
    ),
  };
}
