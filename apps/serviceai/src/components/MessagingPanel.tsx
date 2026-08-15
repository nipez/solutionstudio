"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_DEMO_NOW_ISO,
  DEMO_EXISTING_CUSTOMER_PHONE,
  DEMO_NEW_CALLER_PHONE,
} from "@/lib/seed";
import type { Conversation } from "@/lib/types";

const PRESETS = [
  {
    label: "Maria · no heat (existing)",
    fromPhone: DEMO_EXISTING_CUSTOMER_PHONE,
    body: "No heat — furnace blowing cold air, house at 58F",
  },
  {
    label: "New lead · tune-up",
    fromPhone: DEMO_NEW_CALLER_PHONE,
    body: "Hi — need a furnace tune-up this week",
    newCallerName: "Chris Alvarez",
    newCallerAddress: "221 Benton Ave, Westerville, OH 43081",
    startSpeedToLead: true,
  },
  {
    label: "Escalate · gas smell",
    fromPhone: DEMO_EXISTING_CUSTOMER_PHONE,
    body: "Strong gas smell near the furnace",
  },
];

export function MessagingPanel() {
  const [fromPhone, setFromPhone] = useState(PRESETS[0].fromPhone);
  const [body, setBody] = useState(PRESETS[0].body);
  const [newCallerName, setNewCallerName] = useState("");
  const [newCallerAddress, setNewCallerAddress] = useState("");
  const [startSpeedToLead, setStartSpeedToLead] = useState(false);
  const [threads, setThreads] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/command", { cache: "no-store" });
    const data = await res.json();
    const sms = (data.inbox ?? [])
      .map((r: { conversation: Conversation }) => r.conversation)
      .filter((c: Conversation) => c.channel === "sms" || c.messages.some((m) => m.channel === "sms"));
    setThreads(sms);
    if (!selectedId && sms[0]) setSelectedId(sms[0].id);
  }, [selectedId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function loadPreset(p: (typeof PRESETS)[number]) {
    setFromPhone(p.fromPhone);
    setBody(p.body);
    setNewCallerName("newCallerName" in p ? (p.newCallerName as string) : "");
    setNewCallerAddress(
      "newCallerAddress" in p ? (p.newCallerAddress as string) : "",
    );
    setStartSpeedToLead(Boolean("startSpeedToLead" in p && p.startSpeedToLead));
  }

  async function sendInbound() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/messaging/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromPhone,
          body,
          calledAtIso: DEFAULT_DEMO_NOW_ISO,
          newCallerName: newCallerName || undefined,
          newCallerAddress: newCallerAddress || undefined,
          startSpeedToLead: startSpeedToLead || undefined,
          autoBook: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "SMS failed");
      setSelectedId(data.conversationId);
      setResult(
        data.job
          ? `Job ${data.job.status} · ${data.job.customerName}${data.crmId ? ` · CRM ${data.crmId}` : ""}`
          : data.decision?.action ?? data.mode ?? "ok",
      );
      await refresh();
    } catch (e) {
      setResult(String(e));
    } finally {
      setBusy(false);
    }
  }

  const selected = threads.find((t) => t.id === selectedId);

  return (
    <div>
      <h1>Messaging AI</h1>
      <p className="lede">
        Inbound SMS hits the same booking engine as voice. No Twilio keys —
        stub webhook at <span className="mono">/api/messaging/webhook</span>.
      </p>

      <div className="grid-2">
        <section className="panel">
          <h2>Simulate inbound SMS</h2>
          <div className="scenario-list" style={{ marginBottom: "1rem" }}>
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                className="scenario"
                onClick={() => loadPreset(p)}
              >
                <strong>{p.label}</strong>
                <span>{p.body}</span>
              </button>
            ))}
          </div>
          <div className="field">
            <label htmlFor="smsPhone">From</label>
            <input
              id="smsPhone"
              value={fromPhone}
              onChange={(e) => setFromPhone(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="smsBody">Message</label>
            <textarea
              id="smsBody"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="smsName">New caller name (optional)</label>
            <input
              id="smsName"
              value={newCallerName}
              onChange={(e) => setNewCallerName(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="smsAddr">Address (optional)</label>
            <input
              id="smsAddr"
              value={newCallerAddress}
              onChange={(e) => setNewCallerAddress(e.target.value)}
            />
          </div>
          <label className="chip" style={{ marginBottom: "0.75rem" }}>
            <input
              type="checkbox"
              checked={startSpeedToLead}
              onChange={(e) => setStartSpeedToLead(e.target.checked)}
            />{" "}
            Run speed-to-lead journey
          </label>
          <div className="actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void sendInbound()}
            >
              Send inbound SMS
            </button>
          </div>
          {result && <div className="flash">{result}</div>}
        </section>

        <section className="panel">
          <h2>Threads</h2>
          <div className="inbox-list" style={{ marginBottom: "1rem" }}>
            {threads.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`inbox-row ${selectedId === t.id ? "active" : ""}`}
                onClick={() => setSelectedId(t.id)}
              >
                <strong>{t.fromName ?? t.fromPhone}</strong>
                <div className="preview">
                  {t.messages.length} messages · {t.status}
                </div>
              </button>
            ))}
            {threads.length === 0 && (
              <p className="empty">No SMS threads yet.</p>
            )}
          </div>
          {selected && (
            <div className="transcript">
              {selected.messages.map((m) => (
                <div
                  key={m.id}
                  className={`bubble ${m.role === "customer" ? "caller" : "assistant"}`}
                >
                  <div className="who">
                    {m.role} · {m.channel}
                  </div>
                  <div style={{ whiteSpace: "pre-wrap" }}>{m.body}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
