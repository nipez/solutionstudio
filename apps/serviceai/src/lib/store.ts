import fs from "node:fs";
import path from "node:path";
import { createSeedState } from "./seed";
import type { CallRecord, ShopState } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const STATE_FILE = path.join(DATA_DIR, "shop-state.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function loadState(): ShopState {
  ensureDataDir();
  if (!fs.existsSync(STATE_FILE)) {
    const seeded = createSeedState();
    saveState(seeded);
    return seeded;
  }
  const raw = fs.readFileSync(STATE_FILE, "utf8");
  return JSON.parse(raw) as ShopState;
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
): { state: ShopState; call: CallRecord } {
  const call: CallRecord = {
    id: `call_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    startedAtIso,
    fromPhone,
    channel,
    status: "in_progress",
    transcript: [
      {
        role: "system",
        text: `Inbound ${channel} call from ${fromPhone}`,
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
