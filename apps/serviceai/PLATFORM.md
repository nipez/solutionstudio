# Service AI Platform Spec

**Product:** Service AI — Hatch-like AI platform for trades & home services  
**Founder:** Nick Perez / Solution Studio  
**Consulting page:** https://solutionstud.io/serviceai/  
**App:** `apps/serviceai` (this directory)  
**Marketing site:** Solution Studio static pages stay separate and untouched

---

## Hatch → Service AI map

| Hatch | Service AI | Status |
|-------|------------|--------|
| **Voice AI** | Voice module — simulated call UI + `/api/voice/webhook` stub; same booking engine | **Exists** (first slice); keep Maria Delgado 9:48 PM path |
| **Messaging AI** | SMS conversations on the same booking engine (`evaluateCall` / book / escalate) | **Build now** |
| **Email** | Email adapter on the same engine — booking/estimate follow-up as a conversation | **Stub now**, one working path |
| **Knowledge Engine** | Shop rules: hours, cutoffs, FAQs, brand voice, escalation, job types, techs, service area — editable in UI | **Build now** |
| **Journey Builder** | Multi-step sequences across voice / SMS / email | **v0 now** (seeded journeys that actually fire in demo) |
| **Command Center** | Unified inbox for AI + humans across voice, SMS, email | **Expand now** (replaces thin office list) |
| **Data Bridge** | CRM / calendar / lead-source adapters | **Interface + in-app CRM stub now**; document ST / HCP / Jobber later |

---

## Target customer

- **Trades & home services:** HVAC, plumbing, electrical, garage door, roofing, and similar field-service shops
- **Not** “ServiceTitan-only.” Shops may run ServiceTitan, Housecall Pro, Jobber, Service Fusion, spreadsheets, or nothing clean — Service AI must work with an in-app CRM stub first and plug into field CRMs later
- Primary pain: missed / after-hours / overflow demand that should become **booked jobs** with a complete record for the office
- Buyers: owner-operators and office managers who care about answered calls, speed-to-lead, and schedule accuracy — not a marketing agency stack

---

## Pricing posture

- **Publish later.** Do not hard-code public prices in the product UI yet.
- Design for **platform fee + usage per location** (voice minutes, SMS, email, AI turns) so multi-location groups can expand without a rewrite.
- Demo shop = one location (`Summit Comfort HVAC`). Multi-location billing is out of v1.

---

## Core architecture (shared loop)

All channels funnel into the same booking core:

1. Identify caller/lead (phone → existing customer + property, or new)
2. Understand job type + urgency (from voice intent, SMS text, or form)
3. Apply **Knowledge** rules (hours, emergency cutoff, escalate list, capacity)
4. Offer a valid appointment **or** escalate / needs follow-up
5. Persist a **job record** + conversation thread
6. Write through **Data Bridge** (in-app CRM stub today)
7. Optionally continue via a **Journey** (SMS confirm, morning reminder, email follow-up)

```
Voice / SMS / Email / Form
        ↓
  Knowledge (shop rules)
        ↓
  booking/engine.ts
        ↓
  Job + Conversation (Command Center)
        ↓
  Data Bridge (CRM stub) + Journey runner
```

Do **not** fork a second booking brain per channel.

---

## Module notes

### Voice
Sim UI + webhook stub. Demo clock defaults to 9:48 PM Eastern for the hero path.

### Messaging
Inbound SMS hits `/api/messaging/webhook` (no Twilio keys). Intent is parsed lightly; booking uses the same engine. Outbound stubs record confirmation / “see you in the morning” texts on the thread.

### Email
One path: after book (or on journey step), create an email conversation message (estimate/booking follow-up). Adapter is stubbed — no SendGrid/Mailgun keys.

### Knowledge Engine
Single editable HVAC shop is enough if the model is generic. Edits must affect the **next** booking decision (e.g. raise emergency cutoff → changes slot offers).

### Journey Builder v0
At least two seeded journeys that run in the demo:

1. **After-hours emergency:** voice book → SMS confirm → morning-of reminder  
2. **New lead speed-to-lead:** inbound SMS → qualify → offer slot → book or escalate  

Simulated clock / “Run next step” is fine.

### Command Center
One inbox: voice, SMS, email. Statuses: `booked`, `escalated`, `needs_follow_up`, `in_progress`. Open record → full thread + job fields. Human takeover: mark takeover + add note.

### Data Bridge
`src/lib/bridge/` — `CrmAdapter` interface + `InAppCrmStub`. Jobs write customer / property / job / appointment. **Do not** fake ServiceTitan / Housecall Pro / Jobber HTTP APIs; document how they plug in later.

---

## Out of v1

- Native ServiceTitan (or other field-CRM) production connectors
- “23 lead sources” marketing integrations
- Multi-tenant billing / published pricing pages
- Replacing or restyling Solution Studio marketing HTML
- Real Twilio / Vapi / ElevenLabs / ESP credentials in-repo

---

## Demo acceptance (platform skeleton)

| Surface | Someone can… |
|---------|----------------|
| Voice | Run Maria 9:48 PM → booked job |
| Messaging | Inbound SMS books or escalates via same engine |
| Knowledge | Edit a rule → next call/SMS decision changes |
| Journeys | Fire at least one journey end-to-end in demo |
| Command Center | See mixed-channel records; takeover + note |
| Data Bridge | See CRM stub receive the job write |
| Email | See booking follow-up on the conversation |

`npm install && npm run dev` in this directory (port **3100**). `npm test` covers booking rules, SMS intent, journey fire, knowledge edits, CRM writeback.
