"use client";

import { useCallback, useEffect, useState } from "react";
import type { JourneyDefinition, JourneyRun } from "@/lib/types";

export function JourneysPanel() {
  const [journeys, setJourneys] = useState<JourneyDefinition[]>([]);
  const [runs, setRuns] = useState<JourneyRun[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/journeys", { cache: "no-store" });
    const data = await res.json();
    setJourneys(data.journeys ?? []);
    setRuns(data.runs ?? []);
    if (!selectedId && data.journeys?.[0]) setSelectedId(data.journeys[0].id);
  }, [selectedId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selected = journeys.find((j) => j.id === selectedId);

  async function post(body: Record<string, unknown>) {
    setMessage(null);
    const res = await fetch("/api/journeys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error ?? "Failed");
      return;
    }
    setMessage(
      data.run
        ? `Run ${data.run.id} → ${data.run.status} (step ${data.run.stepIndex})`
        : "Updated",
    );
    await refresh();
  }

  return (
    <div>
      <h1>Journey Builder</h1>
      <p className="lede">
        Multi-step sequences across voice, SMS, and email. v0 ships two seeded
        journeys that actually fire in the demo.
      </p>

      <div className="actions" style={{ marginBottom: "1rem" }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() =>
            void post({ action: "start_demo_speed_to_lead" })
          }
        >
          Run speed-to-lead demo
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => void post({ action: "start_demo_after_hours" })}
        >
          Complete after-hours journey
        </button>
        <button type="button" className="btn" onClick={() => void refresh()}>
          Refresh
        </button>
      </div>
      {message && <div className="flash">{message}</div>}

      <div className="grid-2">
        <section className="panel">
          <h2>Journeys</h2>
          <div className="scenario-list">
            {journeys.map((j) => (
              <button
                key={j.id}
                type="button"
                className={`scenario ${selectedId === j.id ? "active" : ""}`}
                onClick={() => setSelectedId(j.id)}
              >
                <strong>{j.name}</strong>
                <span>
                  {j.description} · {j.enabled ? "enabled" : "disabled"}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2>Steps</h2>
          {!selected && <p className="empty">Select a journey.</p>}
          {selected && (
            <>
              <div className="meta-row">
                <span className="chip mono">{selected.trigger}</span>
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    void post({
                      action: "toggle",
                      journeyId: selected.id,
                      enabled: !selected.enabled,
                    })
                  }
                >
                  {selected.enabled ? "Disable" : "Enable"}
                </button>
              </div>
              <ol className="plain-list steps-ol">
                {selected.steps.map((s, i) => (
                  <li key={s.id}>
                    <strong>
                      {i + 1}. {s.channel}
                    </strong>{" "}
                    · delay {s.delayMinutes}m · {s.action ?? "message"}
                    <div className="preview" style={{ marginTop: "0.35rem" }}>
                      {s.template}
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}

          <h3 style={{ marginTop: "1.5rem" }}>Recent runs</h3>
          {runs.length === 0 && <p className="empty">No runs yet.</p>}
          <ul className="plain-list">
            {runs.slice(0, 8).map((r) => (
              <li key={r.id}>
                <span className="mono">{r.id}</span> · {r.journeyId} ·{" "}
                <span className={`status ${r.status === "completed" ? "booked" : "in_progress"}`}>
                  {r.status}
                </span>
                <div className="actions" style={{ marginTop: "0.35rem" }}>
                  {r.status === "running" && (
                    <button
                      type="button"
                      className="btn"
                      onClick={() =>
                        void post({ action: "advance", runId: r.id })
                      }
                    >
                      Advance next step
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn"
                    onClick={() =>
                      void post({ action: "run_to_completion", runId: r.id })
                    }
                  >
                    Run remaining
                  </button>
                </div>
                <ul style={{ margin: "0.4rem 0 0", paddingLeft: "1.1rem", color: "var(--muted)", fontSize: "0.85rem" }}>
                  {r.log.slice(-4).map((l, i) => (
                    <li key={`${r.id}-${i}`}>{l.detail}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
