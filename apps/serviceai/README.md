# Service AI — After-hours voice booking (first slice)

Local demo app for **Service AI**: after-hours / overflow call answering and appointment booking for trades (HVAC first).

This directory is a standalone Next.js app. It does **not** replace the Solution Studio marketing site (`serviceai/index.html` and other static pages stay untouched).

## What this slice does

One loop:

1. After-hours call comes in (simulated UI, or stub voice webhook)
2. Caller is identified from phone number (existing customer + property when known)
3. Job type and urgency are understood
4. A valid appointment is offered from shop rules (hours, emergency vs routine, tech capacity)
5. Book it — or escalate to a human when rules require it
6. The office gets a complete job record

**Not in scope:** SMS journeys, email campaigns, multi-tenant marketing, Hatch-style lead-source integrations.

## Quick start

```bash
cd apps/serviceai
npm install
npm run dev
```

Open [http://localhost:3100](http://localhost:3100).

1. Click **Run full demo path** (default = existing HVAC customer at **9:48 PM**)
2. Confirm a booked job appears in the call panel
3. Open **Office** to see the complete job record

Also try:

- **New caller · Routine tune-up**
- **Escalate · Gas smell**

```bash
npm test
```

## After-hours rules (Summit Comfort HVAC seed)

| Situation | Behavior |
|-----------|----------|
| Within Mon–Fri 8–5 / Sat 9–1 | Normal capacity |
| After hours + **emergency** before 9 PM | Offer on-call emergency windows |
| After hours + **emergency** at/after 9 PM (demo is **9:48 PM**) | Past cutoff → first **morning emergency** slot |
| After hours + **routine** | Offer next business-hours routine slot (wait until morning) |
| Job types like `gas_smell`, CO, or “talk to a person” | **Escalate** to on-call dispatcher |
| Unknown phone + routine without name/address | **Needs follow-up** |

Demo clock defaults to `2026-01-15T21:48:00-05:00` (Wed 9:48 PM ET) via `DEFAULT_DEMO_NOW_ISO` / optional `DEMO_NOW` in `.env`.

Seed customer for the hero path: **Maria Delgado** `+15550120001` @ 1847 Oak Ridge Dr.

## Architecture

```
src/lib/booking/engine.ts   ← pure booking rules (tested)
src/lib/seed.ts             ← HVAC shop, customers, techs, calendar
src/lib/store.ts            ← JSON file store under data/
src/lib/voice/adapter.ts    ← Twilio/Vapi-shaped webhook stub
src/app/api/demo/call       ← simulated call steps
src/app/api/voice/webhook   ← real-provider-ready stub (no keys)
src/app/api/office          ← job board API
```

The simulated call UI and the voice webhook both call the same `evaluateCall` / `applyBooking` / `applyEscalation` functions.

## Voice provider stub

No Twilio / Vapi / ElevenLabs keys required.

```bash
curl -s http://localhost:3100/api/voice/webhook | jq .
```

Example intent webhook:

```bash
curl -s -X POST http://localhost:3100/api/voice/webhook \
  -H 'content-type: application/json' \
  -d '{
    "provider": "stub",
    "event": "call.intent",
    "fromPhone": "+15550120001",
    "calledAtIso": "2026-01-15T21:48:00-05:00",
    "intent": {
      "jobType": "no_heat",
      "urgency": "emergency",
      "problemSummary": "Furnace blowing cold air, house at 58F"
    }
  }' | jq .
```

Optional query: `?provider=twilio` or `?provider=vapi` for thin body mappers.

Copy `.env.example` → `.env.local` only if you want overrides later. Secrets must never be committed.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server on port 3100 |
| `npm test` | Booking-rule tests |
| `npm run build` | Production build |
| `npm run seed` | Re-write `data/shop-state.json` from seed |

## Data

Runtime state lives in `data/shop-state.json` (created on first run, gitignored). Use **Reset seed** in the UI or `POST /api/shop` with `{ "action": "reset" }`.
