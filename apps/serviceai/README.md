# Service AI

Hatch-like AI platform for trades & home services (HVAC first). Standalone Next.js app under `apps/serviceai` — does **not** replace Solution Studio marketing pages.

Spec map: see **[PLATFORM.md](./PLATFORM.md)**.

## Quick start

```bash
cd apps/serviceai
npm install
npm run dev
```

Open [http://localhost:3100](http://localhost:3100) → **Command Center**.

```bash
npm test
```

## How to try each surface

| Surface | Path | What to do |
|---------|------|------------|
| **Command Center** | `/command` | Unified inbox after you run demos below |
| **Voice** | `/voice` | **Run full demo path** (Maria Delgado, 9:48 PM, no heat) → booked job + CRM + journey SMS |
| **Messaging** | `/messaging` | Send inbound SMS presets (book / new lead journey / escalate) |
| **Journeys** | `/journeys` | **Run speed-to-lead demo** or complete after-hours journey steps |
| **Knowledge** | `/knowledge` | Edit emergency cutoff or escalate keywords → re-run Voice/SMS |
| **Data Bridge** | `/bridge` | See in-app CRM stub writes from booked jobs |
| **Email** | via Command Center | Open a booked record → **Send email follow-up** |

Reset anytime with **Reset seed** on Command Center / Voice.

## Architecture

```
Voice / SMS / Email
        ↓
  Knowledge (editable shop rules)
        ↓
  src/lib/booking/engine.ts
        ↓
  Job + Conversation → Command Center
        ↓
  Data Bridge (CRM stub) + Journey runner
```

No Twilio / Vapi / ESP keys required. Webhooks:

- `POST /api/voice/webhook`
- `POST /api/messaging/webhook`
- `POST /api/email/followup`

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server on port 3100 |
| `npm test` | Booking + platform tests |
| `npm run build` | Production build |
| `npm run seed` | Re-write `data/shop-state.json` |

Founder context: Nick Perez / Solution Studio — https://solutionstud.io/serviceai/
