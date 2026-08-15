"use client";

import { useCallback, useEffect, useState } from "react";
import type { Conversation, CrmRecord, JobRecord } from "@/lib/types";

interface InboxRow {
  conversation: Conversation;
  job: JobRecord | null;
  crm: CrmRecord | null;
  preview: string;
}

export function CommandCenter() {
  const [inbox, setInbox] = useState<InboxRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/command", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setInbox(data.inbox ?? []);
      if (!selectedId && data.inbox?.[0]) {
        setSelectedId(data.inbox[0].conversation.id);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selected = inbox.find((r) => r.conversation.id === selectedId);

  async function act(action: "takeover" | "release" | "note") {
    if (!selectedId) return;
    await fetch("/api/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId: selectedId,
        action,
        note: note || undefined,
      }),
    });
    setNote("");
    await refresh();
  }

  async function sendEmail() {
    if (!selected?.job?.id) return;
    await fetch("/api/email/followup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: selected.job.id }),
    });
    await refresh();
  }

  async function resetShop() {
    await fetch("/api/shop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset" }),
    });
    setSelectedId(null);
    await refresh();
  }

  return (
    <div>
      <h1>Command Center</h1>
      <p className="lede">
        Unified inbox across voice, SMS, and email — AI + human takeover on the
        same job record.
      </p>

      <div className="actions" style={{ marginBottom: "1rem" }}>
        <button type="button" className="btn" onClick={() => void refresh()}>
          Refresh
        </button>
        <button type="button" className="btn" onClick={() => void resetShop()}>
          Reset seed
        </button>
      </div>

      {error && <div className="flash danger">{error}</div>}

      <div className="grid-2">
        <section className="panel">
          <h2>Inbox</h2>
          {loading && <p className="empty">Loading…</p>}
          {!loading && inbox.length === 0 && (
            <p className="empty">
              Empty. Run the 9:48 PM voice demo or send an SMS from Messaging.
            </p>
          )}
          <div className="inbox-list">
            {inbox.map((row) => (
              <button
                key={row.conversation.id}
                type="button"
                className={`inbox-row ${selectedId === row.conversation.id ? "active" : ""}`}
                onClick={() => setSelectedId(row.conversation.id)}
              >
                <div className="inbox-row__top">
                  <span className={`channel-pill ${row.conversation.channel}`}>
                    {row.conversation.channel}
                  </span>
                  <span className={`status ${row.conversation.status}`}>
                    {row.conversation.status.replace(/_/g, " ")}
                  </span>
                </div>
                <strong>
                  {row.conversation.fromName ?? row.conversation.fromPhone}
                </strong>
                <div className="preview">{row.preview}</div>
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2>Record</h2>
          {!selected && <p className="empty">Select a conversation.</p>}
          {selected && (
            <>
              <div className="meta-row">
                <span className={`channel-pill ${selected.conversation.channel}`}>
                  {selected.conversation.channel}
                </span>
                <span className={`status ${selected.conversation.status}`}>
                  {selected.conversation.status.replace(/_/g, " ")}
                </span>
                {selected.conversation.humanTakeover && (
                  <span className="chip live">Human takeover</span>
                )}
                {selected.crm && (
                  <span className="chip mono">CRM {selected.crm.id}</span>
                )}
              </div>

              <div className="transcript" style={{ marginBottom: "1rem" }}>
                {selected.conversation.messages.map((m) => (
                  <div key={m.id} className={`bubble ${m.role === "customer" ? "caller" : m.role === "ai" ? "assistant" : "system"}`}>
                    <div className="who">
                      {m.role} · {m.channel}
                    </div>
                    <div style={{ whiteSpace: "pre-wrap" }}>{m.body}</div>
                  </div>
                ))}
              </div>

              {selected.job && (
                <dl className="detail-grid" style={{ marginBottom: "1rem" }}>
                  <dt>Customer</dt>
                  <dd>{selected.job.customerName}</dd>
                  <dt>Property</dt>
                  <dd>{selected.job.propertyAddress ?? "—"}</dd>
                  <dt>Job</dt>
                  <dd>
                    {selected.job.jobType} · {selected.job.urgency}
                  </dd>
                  <dt>Appointment</dt>
                  <dd className="mono">
                    {selected.job.appointmentStartIso ?? "—"}
                    {selected.job.technicianName
                      ? ` · ${selected.job.technicianName}`
                      : ""}
                  </dd>
                  <dt>Problem</dt>
                  <dd>{selected.job.problemSummary}</dd>
                </dl>
              )}

              <div className="field">
                <label htmlFor="note">Office note</label>
                <input
                  id="note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add a note for the team"
                />
              </div>
              <div className="actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void act("takeover")}
                >
                  Take over
                </button>
                <button type="button" className="btn" onClick={() => void act("release")}>
                  Release to AI
                </button>
                <button type="button" className="btn" onClick={() => void act("note")}>
                  Add note
                </button>
                {selected.job && (
                  <button type="button" className="btn" onClick={() => void sendEmail()}>
                    Send email follow-up
                  </button>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
