"use client";

import { useEffect, useState } from "react";
import type { CrmRecord } from "@/lib/types";

export function BridgePanel() {
  const [records, setRecords] = useState<CrmRecord[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/bridge/crm", { cache: "no-store" });
      const data = await res.json();
      setRecords(data.records ?? []);
      setNotes(data.notes ?? {});
    })();
  }, []);

  return (
    <div>
      <h1>Data Bridge</h1>
      <p className="lede">
        CRM adapter interface with an in-app stub. Jobs write customer,
        property, job, and appointment here. Field CRMs plug in later — we do
        not fake their APIs.
      </p>

      <section className="panel">
        <h2>Active adapter: in_app_stub</h2>
        <p className="lede">
          Later connectors (documented only):
        </p>
        <ul className="plain-list">
          {Object.entries(notes).map(([k, v]) => (
            <li key={k}>
              <strong>{k}</strong> — {v}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel" style={{ marginTop: "1rem" }}>
        <h2>CRM stub writes</h2>
        {records.length === 0 && (
          <p className="empty">
            No writes yet. Book a job on Voice or Messaging.
          </p>
        )}
        <table className="job-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Customer</th>
              <th>Job</th>
              <th>Appointment</th>
              <th>Record</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.id}>
                <td className="mono" style={{ fontSize: "0.8rem" }}>
                  {new Date(r.writtenAtIso).toLocaleString()}
                </td>
                <td>
                  {r.customerName}
                  <div className="mono" style={{ color: "var(--muted)" }}>
                    {r.phone}
                  </div>
                </td>
                <td>
                  {r.jobType} · {r.status}
                  <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                    {r.propertyAddress}
                  </div>
                </td>
                <td className="mono" style={{ fontSize: "0.8rem" }}>
                  {r.appointmentStartIso ?? "—"}
                  {r.technicianName ? ` · ${r.technicianName}` : ""}
                </td>
                <td className="mono">{r.id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
