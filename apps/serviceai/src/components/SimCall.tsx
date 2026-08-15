"use client";

import { useMemo, useState } from "react";
import {
  DEFAULT_DEMO_NOW_ISO,
  DEMO_EXISTING_CUSTOMER_PHONE,
  DEMO_NEW_CALLER_PHONE,
} from "@/lib/seed";
import type { BookingDecision, JobRecord, Urgency } from "@/lib/types";

type ScenarioId = "existing_emergency" | "new_routine" | "escalate_gas";

interface Scenario {
  id: ScenarioId;
  title: string;
  blurb: string;
  fromPhone: string;
  calledAtIso: string;
  jobType: string;
  urgency: Urgency;
  problemSummary: string;
  newCallerName?: string;
  newCallerAddress?: string;
  requestHuman?: boolean;
}

const SCENARIOS: Scenario[] = [
  {
    id: "existing_emergency",
    title: "9:48 PM · Existing HVAC customer",
    blurb: "Maria Delgado · no heat · recognize customer + property · book morning emergency",
    fromPhone: DEMO_EXISTING_CUSTOMER_PHONE,
    calledAtIso: DEFAULT_DEMO_NOW_ISO,
    jobType: "no_heat",
    urgency: "emergency",
    problemSummary: "Furnace blowing cold air. House is down to 58°F and dropping.",
  },
  {
    id: "new_routine",
    title: "New caller · Routine tune-up",
    blurb: "Unknown number · capture name/address · offer next business slot",
    fromPhone: DEMO_NEW_CALLER_PHONE,
    calledAtIso: DEFAULT_DEMO_NOW_ISO,
    jobType: "tune_up",
    urgency: "routine",
    problemSummary: "Annual furnace tune-up before winter gets worse.",
    newCallerName: "Chris Alvarez",
    newCallerAddress: "221 Benton Ave, Westerville, OH 43081",
  },
  {
    id: "escalate_gas",
    title: "Escalate · Gas smell",
    blurb: "Safety rule · do not self-book · hand to on-call dispatcher",
    fromPhone: DEMO_EXISTING_CUSTOMER_PHONE,
    calledAtIso: DEFAULT_DEMO_NOW_ISO,
    jobType: "gas_smell",
    urgency: "emergency",
    problemSummary: "Strong gas smell near the furnace closet.",
  },
];

interface TranscriptLine {
  role: "assistant" | "caller" | "system";
  text: string;
}

export function SimCall() {
  const [scenarioId, setScenarioId] = useState<ScenarioId>("existing_emergency");
  const scenario = useMemo(
    () => SCENARIOS.find((s) => s.id === scenarioId)!,
    [scenarioId],
  );

  const [fromPhone, setFromPhone] = useState(scenario.fromPhone);
  const [jobType, setJobType] = useState(scenario.jobType);
  const [urgency, setUrgency] = useState<Urgency>(scenario.urgency);
  const [problemSummary, setProblemSummary] = useState(scenario.problemSummary);
  const [newCallerName, setNewCallerName] = useState(scenario.newCallerName ?? "");
  const [newCallerAddress, setNewCallerAddress] = useState(
    scenario.newCallerAddress ?? "",
  );
  const [callId, setCallId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [calledAtIso, setCalledAtIso] = useState(scenario.calledAtIso);
  const [decision, setDecision] = useState<BookingDecision | null>(null);
  const [job, setJob] = useState<JobRecord | null>(null);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function loadScenario(next: Scenario) {
    setScenarioId(next.id);
    setFromPhone(next.fromPhone);
    setJobType(next.jobType);
    setUrgency(next.urgency);
    setProblemSummary(next.problemSummary);
    setNewCallerName(next.newCallerName ?? "");
    setNewCallerAddress(next.newCallerAddress ?? "");
    setCalledAtIso(next.calledAtIso);
    setCallId(null);
    setConversationId(null);
    setDecision(null);
    setJob(null);
    setTranscript([]);
    setError(null);
  }

  async function resetShop() {
    setBusy(true);
    setError(null);
    try {
      await fetch("/api/shop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      });
      setCallId(null);
      setConversationId(null);
      setDecision(null);
      setJob(null);
      setTranscript([{ role: "system", text: "Shop data reset to seed." }]);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function startCall() {
    setBusy(true);
    setError(null);
    setDecision(null);
    setJob(null);
    try {
      const res = await fetch("/api/demo/call?step=start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromPhone, calledAtIso }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Start failed");
      setCallId(data.call.id);
      setConversationId(data.conversationId ?? data.call.conversationId ?? null);
      setCalledAtIso(data.calledAtIso);
      setTranscript(
        data.call.transcript.map((t: TranscriptLine) => ({
          role: t.role,
          text: t.text,
        })),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function evaluate() {
    if (!callId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/demo/call?step=evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callId,
          conversationId: conversationId ?? undefined,
          fromPhone,
          calledAtIso,
          problemSummary,
          jobType,
          urgency,
          newCallerName: newCallerName || undefined,
          newCallerAddress: newCallerAddress || undefined,
          requestHuman: scenarioId === "escalate_gas" ? false : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Evaluate failed");
      setDecision(data.decision);
      setTranscript((prev) => [
        ...prev,
        { role: "caller", text: `${jobType}: ${problemSummary}` },
        {
          role: "assistant",
          text:
            data.decision.action === "offer_slots"
              ? `Recognized ${data.decision.caller.displayName}. ${data.decision.reason}.`
              : data.decision.reason,
        },
      ]);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function book(slotId: string) {
    if (!callId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/demo/call?step=book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callId,
          conversationId: conversationId ?? undefined,
          slotId,
          fromPhone,
          calledAtIso,
          problemSummary,
          jobType,
          urgency,
          newCallerName: newCallerName || undefined,
          newCallerAddress: newCallerAddress || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Book failed");
      setJob(data.job);
      setTranscript((prev) => [
        ...prev,
        {
          role: "assistant",
          text: `Booked with ${data.job.technicianName}. CRM ${data.crmId ?? "written"}. Office has the complete job record.`,
        },
      ]);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function escalate(asFollowUp = false) {
    if (!callId || !decision) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/demo/call?step=escalate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callId,
          conversationId: conversationId ?? undefined,
          fromPhone,
          calledAtIso,
          problemSummary,
          jobType,
          urgency,
          reason: decision.reason,
          newCallerName: newCallerName || undefined,
          newCallerAddress: newCallerAddress || undefined,
          asFollowUp,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Escalate failed");
      setJob(data.job);
      setTranscript((prev) => [
        ...prev,
        {
          role: "assistant",
          text: asFollowUp
            ? "Flagged for office follow-up."
            : "Transferring to a person. Job record created for the office.",
        },
      ]);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function runOneClick() {
    setBusy(true);
    setError(null);
    setDecision(null);
    setJob(null);
    try {
      await fetch("/api/shop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      });

      const startRes = await fetch("/api/demo/call?step=start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromPhone, calledAtIso }),
      });
      const startData = await startRes.json();
      if (!startRes.ok) throw new Error(startData.error ?? "Start failed");
      const id = startData.call.id as string;
      const convId = (startData.conversationId ?? startData.call.conversationId) as string;
      setCallId(id);
      setConversationId(convId);
      setCalledAtIso(startData.calledAtIso);

      const evalRes = await fetch("/api/demo/call?step=evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callId: id,
          conversationId: convId,
          fromPhone,
          calledAtIso: startData.calledAtIso,
          problemSummary,
          jobType,
          urgency,
          newCallerName: newCallerName || undefined,
          newCallerAddress: newCallerAddress || undefined,
        }),
      });
      const evalData = await evalRes.json();
      if (!evalRes.ok) throw new Error(evalData.error ?? "Evaluate failed");
      setDecision(evalData.decision);

      const lines: TranscriptLine[] = [
        ...startData.call.transcript.map((t: TranscriptLine) => ({
          role: t.role,
          text: t.text,
        })),
        { role: "caller", text: `${jobType}: ${problemSummary}` },
      ];

      if (evalData.decision.action === "offer_slots") {
        const slotId = evalData.decision.offers[0].slotId as string;
        const bookRes = await fetch("/api/demo/call?step=book", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            callId: id,
            conversationId: convId,
            slotId,
            fromPhone,
            calledAtIso: startData.calledAtIso,
            problemSummary,
            jobType,
            urgency,
            newCallerName: newCallerName || undefined,
            newCallerAddress: newCallerAddress || undefined,
          }),
        });
        const bookData = await bookRes.json();
        if (!bookRes.ok) throw new Error(bookData.error ?? "Book failed");
        setJob(bookData.job);
        lines.push({
          role: "assistant",
          text: `Recognized ${evalData.decision.caller.displayName}. ${evalData.decision.reason}. Booked with ${bookData.job.technicianName}. CRM ${bookData.crmId}.`,
        });
      } else if (evalData.decision.action === "escalate") {
        const escRes = await fetch("/api/demo/call?step=escalate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            callId: id,
            conversationId: convId,
            fromPhone,
            calledAtIso: startData.calledAtIso,
            problemSummary,
            jobType,
            urgency,
            reason: evalData.decision.reason,
            newCallerName: newCallerName || undefined,
            newCallerAddress: newCallerAddress || undefined,
          }),
        });
        const escData = await escRes.json();
        if (!escRes.ok) throw new Error(escData.error ?? "Escalate failed");
        setJob(escData.job);
        lines.push({
          role: "assistant",
          text: `${evalData.decision.reason} Transferring to on-call dispatcher.`,
        });
      } else {
        const followRes = await fetch("/api/demo/call?step=escalate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            callId: id,
            conversationId: convId,
            fromPhone,
            calledAtIso: startData.calledAtIso,
            problemSummary,
            jobType,
            urgency,
            reason: evalData.decision.reason,
            newCallerName: newCallerName || undefined,
            newCallerAddress: newCallerAddress || undefined,
            asFollowUp: true,
          }),
        });
        const followData = await followRes.json();
        if (!followRes.ok) throw new Error(followData.error ?? "Follow-up failed");
        setJob(followData.job);
        lines.push({
          role: "assistant",
          text: evalData.decision.reason,
        });
      }

      setTranscript(lines);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1>Simulated after-hours call</h1>
      <p className="lede">
        Click through the same booking engine a real voice webhook will use.
        No Twilio / Vapi keys required. Default path: existing HVAC customer at
        9:48 PM.
      </p>

      <div className="grid-2">
        <section className="panel">
          <h2>Scenario</h2>
          <div className="scenario-list">
            {SCENARIOS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`scenario ${scenarioId === s.id ? "active" : ""}`}
                onClick={() => loadScenario(s)}
              >
                <strong>{s.title}</strong>
                <span>{s.blurb}</span>
              </button>
            ))}
          </div>

          <div className="meta-row" style={{ marginTop: "1rem" }}>
            <span className="chip live">ANSWERED</span>
            <span className="chip mono">{calledAtIso}</span>
            <span className="chip">Summit Comfort HVAC</span>
          </div>

          <div className="field">
            <label htmlFor="fromPhone">Caller ID</label>
            <input
              id="fromPhone"
              value={fromPhone}
              onChange={(e) => setFromPhone(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="jobType">Job type</label>
            <input
              id="jobType"
              value={jobType}
              onChange={(e) => setJobType(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="urgency">Urgency</label>
            <select
              id="urgency"
              value={urgency}
              onChange={(e) => setUrgency(e.target.value as Urgency)}
            >
              <option value="emergency">Emergency</option>
              <option value="same_day">Same day</option>
              <option value="routine">Routine</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="problem">Problem</label>
            <textarea
              id="problem"
              value={problemSummary}
              onChange={(e) => setProblemSummary(e.target.value)}
            />
          </div>
          {(scenarioId === "new_routine" || newCallerName || newCallerAddress) && (
            <>
              <div className="field">
                <label htmlFor="newName">New caller name</label>
                <input
                  id="newName"
                  value={newCallerName}
                  onChange={(e) => setNewCallerName(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="newAddr">Service address</label>
                <input
                  id="newAddr"
                  value={newCallerAddress}
                  onChange={(e) => setNewCallerAddress(e.target.value)}
                />
              </div>
            </>
          )}

          <div className="actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={runOneClick}
            >
              Run full demo path
            </button>
            <button type="button" className="btn" disabled={busy} onClick={startCall}>
              1. Answer call
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy || !callId}
              onClick={evaluate}
            >
              2. Understand & offer
            </button>
            <button type="button" className="btn" disabled={busy} onClick={resetShop}>
              Reset seed
            </button>
          </div>
          {error && <div className="flash danger">{error}</div>}
        </section>

        <section className="panel">
          <h2>Call</h2>
          <div className="transcript">
            {transcript.length === 0 && (
              <p className="empty">Start a call or run the full demo path.</p>
            )}
            {transcript.map((line, i) => (
              <div key={`${i}-${line.text.slice(0, 12)}`} className={`bubble ${line.role}`}>
                <div className="who">{line.role}</div>
                <div>{line.text}</div>
              </div>
            ))}
          </div>

          {decision?.action === "offer_slots" && !job && (
            <div className="offers">
              <h3>Valid appointments</h3>
              <p className="lede" style={{ marginBottom: "0.5rem" }}>
                {decision.caller.kind === "existing"
                  ? `${decision.caller.displayName} · ${decision.caller.property?.addressLine1 ?? "property on file"}`
                  : `${decision.caller.displayName} · new caller`}
              </p>
              {decision.offers.map((o) => (
                <div key={o.slotId} className="offer">
                  <div>
                    <strong>{o.label}</strong>
                    <div className="meta">{o.technicianName}</div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy}
                    onClick={() => book(o.slotId)}
                  >
                    Book
                  </button>
                </div>
              ))}
            </div>
          )}

          {decision?.action === "escalate" && !job && (
            <div className="flash danger">
              <strong>Escalate to human</strong>
              <p>{decision.reason}</p>
              <div className="actions">
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={busy}
                  onClick={() => escalate(false)}
                >
                  Create escalated job
                </button>
              </div>
            </div>
          )}

          {decision?.action === "needs_follow_up" && !job && (
            <div className="flash warn">
              <strong>Needs follow-up</strong>
              <p>{decision.reason}</p>
              <div className="actions">
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => escalate(true)}
                >
                  Flag for office
                </button>
              </div>
            </div>
          )}

          {job && (
            <div className={`flash ${job.status === "booked" ? "" : job.status === "escalated" ? "danger" : "warn"}`}>
              <strong>
                Job {job.status.replace(/_/g, " ")} · {job.id}
              </strong>
              <p>
                {job.customerName}
                {job.propertyAddress ? ` · ${job.propertyAddress}` : ""}
              </p>
              {job.appointmentStartIso && (
                <p className="mono">
                  {job.technicianName} · {job.appointmentStartIso}
                </p>
              )}
              {job.escalationReason && <p>{job.escalationReason}</p>}
              <p>
                Open the <a href="/command">Command Center</a> for the full
                thread and CRM write.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
