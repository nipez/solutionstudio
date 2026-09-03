"use client";

import { useCallback, useEffect, useState } from "react";
import type { JobRecord } from "@/lib/types";

export function OfficeBoard() {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/office", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setJobs(data.jobs ?? []);
      if (!selectedId && data.jobs?.[0]) setSelectedId(data.jobs[0].id);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selected = jobs.find((j) => j.id === selectedId) ?? null;

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
      <h1>Office board</h1>
      <p className="lede">
        Complete job records from after-hours calls — booked, escalated, or
        needs follow-up.
      </p>

      <div className="actions" style={{ marginBottom: "1rem" }}>
        <button type="button" className="btn" onClick={() => void refresh()}>
          Refresh
        </button>
        <button type="button" className="btn" onClick={() => void resetShop()}>
          Reset seed
        </button>
        <a className="btn" href="/">
          Back to sim call
        </a>
      </div>

      {error && <div className="flash danger">{error}</div>}

      <div className="grid-2">
        <section className="panel">
          <h2>Calls / jobs</h2>
          {loading && <p className="empty">Loading…</p>}
          {!loading && jobs.length === 0 && (
            <p className="empty">
              No jobs yet. Run the 9:48 PM demo on the simulated call screen.
            </p>
          )}
          {jobs.length > 0 && (
            <table className="job-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Customer</th>
                  <th>Job</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr
                    key={job.id}
                    className={selectedId === job.id ? "selected" : ""}
                    onClick={() => setSelectedId(job.id)}
                  >
                    <td>
                      <span className={`status ${job.status}`}>
                        {job.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td>
                      <div>{job.customerName}</div>
                      <div className="mono" style={{ color: "var(--muted)" }}>
                        {job.fromPhone}
                      </div>
                    </td>
                    <td>
                      {job.jobType}
                      <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                        {job.urgency}
                      </div>
                    </td>
                    <td className="mono" style={{ fontSize: "0.8rem" }}>
                      {new Date(job.calledAtIso).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="panel">
          <h2>Job record</h2>
          {!selected && <p className="empty">Select a job to inspect.</p>}
          {selected && (
            <>
              <div className="meta-row">
                <span className={`status ${selected.status}`}>
                  {selected.status.replace(/_/g, " ")}
                </span>
                <span className="chip mono">{selected.id}</span>
                {selected.isExistingCustomer ? (
                  <span className="chip live">Existing customer</span>
                ) : (
                  <span className="chip">New caller</span>
                )}
              </div>
              <dl className="detail-grid">
                <dt>Customer</dt>
                <dd>{selected.customerName}</dd>
                <dt>Phone</dt>
                <dd className="mono">{selected.fromPhone}</dd>
                <dt>Property</dt>
                <dd>{selected.propertyAddress ?? "—"}</dd>
                <dt>Trade</dt>
                <dd>{selected.trade}</dd>
                <dt>Job type</dt>
                <dd>{selected.jobType}</dd>
                <dt>Urgency</dt>
                <dd>{selected.urgency}</dd>
                <dt>Problem</dt>
                <dd>{selected.problemSummary}</dd>
                <dt>Called at</dt>
                <dd className="mono">{selected.calledAtIso}</dd>
                <dt>Appointment</dt>
                <dd>
                  {selected.appointmentStartIso ? (
                    <>
                      <div className="mono">{selected.appointmentStartIso}</div>
                      <div>
                        {selected.technicianName} ({selected.technicianId})
                      </div>
                    </>
                  ) : (
                    "—"
                  )}
                </dd>
                {selected.escalationReason && (
                  <>
                    <dt>Escalation</dt>
                    <dd>
                      {selected.escalationReason}
                      {selected.escalateTo
                        ? ` → ${selected.escalateTo.replace(/_/g, " ")}`
                        : ""}
                    </dd>
                  </>
                )}
                <dt>Notes</dt>
                <dd>
                  <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
                    {selected.notes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                </dd>
              </dl>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
