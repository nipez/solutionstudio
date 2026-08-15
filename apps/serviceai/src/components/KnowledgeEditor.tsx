"use client";

import { useEffect, useState } from "react";
import type { ShopRules, Technician } from "@/lib/types";

export function KnowledgeEditor() {
  const [shop, setShop] = useState<ShopRules | null>(null);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [keywords, setKeywords] = useState("");
  const [escalateTypes, setEscalateTypes] = useState("");

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/knowledge");
      const data = await res.json();
      setShop(data.shop);
      setTechnicians(data.technicians);
      setKeywords((data.shop.escalateKeywords ?? []).join(", "));
      setEscalateTypes((data.shop.alwaysEscalateJobTypes ?? []).join(", "));
    })();
  }, []);

  async function save() {
    if (!shop) return;
    setStatus(null);
    const payload = {
      shop: {
        ...shop,
        escalateKeywords: keywords
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        alwaysEscalateJobTypes: escalateTypes
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      },
      technicians,
    };
    const res = await fetch("/api/knowledge", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setStatus(String(data.error ?? "Save failed"));
      return;
    }
    setShop(data.shop);
    setStatus(
      "Saved. Next voice/SMS evaluateCall will use these rules (try changing emergency cutoff).",
    );
  }

  if (!shop) return <p className="empty">Loading knowledge…</p>;

  return (
    <div>
      <h1>Knowledge Engine</h1>
      <p className="lede">
        Shop rules, brand voice, FAQs, job types, escalation, techs, and service
        area. Edits persist and change the next booking decision.
      </p>

      <div className="grid-2">
        <section className="panel">
          <h2>Hours & after-hours</h2>
          <div className="field">
            <label htmlFor="shopName">Shop name</label>
            <input
              id="shopName"
              value={shop.name}
              onChange={(e) => setShop({ ...shop, name: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="cutoff">Emergency cutoff hour (local 0–23)</label>
            <input
              id="cutoff"
              type="number"
              min={0}
              max={23}
              value={shop.emergencyCutoffHour}
              onChange={(e) =>
                setShop({
                  ...shop,
                  emergencyCutoffHour: Number(e.target.value),
                })
              }
            />
          </div>
          <p className="lede">
            Demo clock is 9:48 PM. Cutoff ≤ 21 → morning emergency. Cutoff ≥ 22
            → still treats 21:48 as pre-cutoff (same-night emergency windows if
            open).
          </p>
          <div className="field">
            <label htmlFor="greeting">After-hours greeting</label>
            <textarea
              id="greeting"
              value={shop.afterHoursGreeting}
              onChange={(e) =>
                setShop({ ...shop, afterHoursGreeting: e.target.value })
              }
            />
          </div>
          <div className="field">
            <label htmlFor="voice">Brand voice</label>
            <textarea
              id="voice"
              value={shop.brandVoice}
              onChange={(e) => setShop({ ...shop, brandVoice: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="escTypes">Always-escalate job types (comma)</label>
            <input
              id="escTypes"
              value={escalateTypes}
              onChange={(e) => setEscalateTypes(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="escKw">Escalate keywords (comma)</label>
            <input
              id="escKw"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="cities">Service cities (comma)</label>
            <input
              id="cities"
              value={shop.serviceArea.cities.join(", ")}
              onChange={(e) =>
                setShop({
                  ...shop,
                  serviceArea: {
                    ...shop.serviceArea,
                    cities: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  },
                })
              }
            />
          </div>
          <div className="actions">
            <button type="button" className="btn btn-primary" onClick={() => void save()}>
              Save knowledge
            </button>
          </div>
          {status && <div className="flash">{status}</div>}
        </section>

        <section className="panel">
          <h2>Job types & FAQs</h2>
          <ul className="plain-list">
            {shop.jobTypes.map((jt) => (
              <li key={jt.id}>
                <strong>{jt.label}</strong>{" "}
                <span className="mono">({jt.id})</span> · {jt.defaultUrgency}
                {jt.alwaysEscalate ? " · escalate" : ""}
              </li>
            ))}
          </ul>
          <h3 style={{ marginTop: "1.25rem" }}>FAQs</h3>
          {shop.faqs.map((faq, idx) => (
            <div key={faq.id} className="field">
              <label>Q</label>
              <input
                value={faq.question}
                onChange={(e) => {
                  const faqs = [...shop.faqs];
                  faqs[idx] = { ...faq, question: e.target.value };
                  setShop({ ...shop, faqs });
                }}
              />
              <label>A</label>
              <textarea
                value={faq.answer}
                onChange={(e) => {
                  const faqs = [...shop.faqs];
                  faqs[idx] = { ...faq, answer: e.target.value };
                  setShop({ ...shop, faqs });
                }}
              />
            </div>
          ))}

          <h3 style={{ marginTop: "1.25rem" }}>Technicians</h3>
          <ul className="plain-list">
            {technicians.map((t) => (
              <li key={t.id}>
                {t.name} · on-call {t.onCall ? "yes" : "no"} ·{" "}
                <button
                  type="button"
                  className="btn"
                  style={{ padding: "0.2rem 0.5rem" }}
                  onClick={() =>
                    setTechnicians((prev) =>
                      prev.map((x) =>
                        x.id === t.id ? { ...x, onCall: !x.onCall } : x,
                      ),
                    )
                  }
                >
                  Toggle on-call
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
