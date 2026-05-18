"use client";

import { useState, useRef } from "react";

type LogEntry = { type: "ok" | "err" | "info" | "warn"; msg: string };

function useLogger() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const add = (type: LogEntry["type"], msg: string) =>
    setLogs((prev) => [...prev, { type, msg }]);
  const clear = () => setLogs([]);
  return { logs, add, clear };
}

const RANDOM_NAMES = [
  "Alice Johnson","Bob Sharma","Carol Williams","David Patel",
  "Eva Martinez","Frank Chen","Grace Kim","Henry Brown",
  "Iris Singh","James Thompson","Karen Lee","Liam Nair",
];
const RANDOM_CITIES = ["Mumbai","Delhi","Bangalore","Chennai","Kolkata","Hyderabad"];

function randomLead() {
  return {
    customer_name: RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)],
    phone: `9${Math.floor(100000000 + Math.random() * 900000000)}`,
    city: RANDOM_CITIES[Math.floor(Math.random() * RANDOM_CITIES.length)],
    service_id: Math.ceil(Math.random() * 3),
    description: "Auto-generated test lead for concurrency testing.",
  };
}

function generateIdempotencyKey() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export default function TestToolsPage() {
  const quotaLogger = useLogger();
  const idempLogger = useLogger();
  const concLogger = useLogger();

  const [quotaLoading, setQuotaLoading] = useState(false);
  const [idempLoading, setIdempLoading] = useState(false);
  const [concLoading, setConcLoading] = useState(false);

  // Shared idempotency key for the repeated-call test (persists across calls)
  const sharedKeyRef = useRef<string>(generateIdempotencyKey());

  // ── Tool 1: Reset quota ────────────────────────────────────────────────
  async function handleResetQuota() {
    setQuotaLoading(true);
    quotaLogger.clear();
    const key = generateIdempotencyKey();
    quotaLogger.add("info", `POST /api/webhook/quota-reset`);
    quotaLogger.add("info", `X-Idempotency-Key: ${key}`);
    try {
      const res = await fetch("/api/webhook/quota-reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Idempotency-Key": key,
        },
      });
      const data = await res.json();
      if (res.ok) {
        quotaLogger.add("ok", `✓ ${data.message}`);
        quotaLogger.add("ok", `already_processed: ${data.already_processed}`);
      } else {
        quotaLogger.add("err", `✕ ${data.error}`);
      }
    } catch (e) {
      quotaLogger.add("err", `Network error: ${e}`);
    } finally {
      setQuotaLoading(false);
    }
  }

  // ── Tool 2: Idempotency test ───────────────────────────────────────────
  async function handleIdempotencyTest() {
    setIdempLoading(true);
    idempLogger.clear();
    const key = sharedKeyRef.current;
    idempLogger.add("info", `Shared key: ${key}`);
    idempLogger.add("info", `Sending 5 requests with the SAME key...`);

    const results = await Promise.all(
      Array.from({ length: 5 }).map(async (_, i) => {
        const res = await fetch("/api/webhook/quota-reset", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Idempotency-Key": key,
          },
        });
        const data = await res.json();
        return { i, ok: res.ok, data };
      })
    );

    results.forEach(({ i, ok, data }) => {
      const type = ok ? (data.already_processed ? "warn" : "ok") : "err";
      idempLogger.add(
        type,
        `[${i + 1}] ${ok ? "200" : "err"} — already_processed: ${data.already_processed ?? "N/A"} — ${data.message ?? data.error}`
      );
    });

    const processed = results.filter((r) => r.ok && !r.data.already_processed).length;
    const skipped = results.filter((r) => r.ok && r.data.already_processed).length;
    idempLogger.add(
      processed === 1 ? "ok" : "err",
      `Summary: ${processed} processed, ${skipped} skipped (idempotency ${processed === 1 ? "✓ WORKING" : "✕ BROKEN"})`
    );

    // Rotate key so next test run feels fresh (user can re-click for another round)
    sharedKeyRef.current = generateIdempotencyKey();
    setIdempLoading(false);
  }

  // ── Tool 3: Concurrency test ───────────────────────────────────────────
  async function handleConcurrencyTest() {
    setConcLoading(true);
    concLogger.clear();
    concLogger.add("info", "Firing 10 lead creation requests simultaneously...");

    const leads = Array.from({ length: 10 }, randomLead);
    const start = Date.now();

    const results = await Promise.allSettled(
      leads.map((lead) =>
        fetch("/api/leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(lead),
        }).then(async (res) => ({ status: res.status, data: await res.json() }))
      )
    );

    const elapsed = Date.now() - start;
    concLogger.add("info", `All 10 requests completed in ${elapsed}ms`);

    results.forEach((r, i) => {
      if (r.status === "fulfilled") {
        const { status, data } = r.value;
        const type = status === 201 ? "ok" : status === 409 ? "warn" : "err";
        concLogger.add(
          type,
          `[${i + 1}] ${status} — ${
            status === 201
              ? `Lead ${data.lead_id?.slice(0, 8)}… created`
              : data.error ?? "unknown"
          }`
        );
      } else {
        concLogger.add("err", `[${i + 1}] Network failure: ${r.reason}`);
      }
    });

    const created = results.filter(
      (r) => r.status === "fulfilled" && r.value.status === 201
    ).length;
    const dupes = results.filter(
      (r) => r.status === "fulfilled" && r.value.status === 409
    ).length;
    concLogger.add("info", `Created: ${created} | Duplicates rejected: ${dupes}`);
    concLogger.add(
      "ok",
      "Check /dashboard to verify fair allocation across providers."
    );

    setConcLoading(false);
  }

  return (
    <div className="page-wrap">
      <div className="page-header">
        <h1>Test Tools</h1>
        <p>
          Internal testing panel for simulating payment webhooks and stress-testing
          the lead distribution engine.
        </p>
      </div>

      <div className="alert alert-warning" style={{ marginBottom: 32 }}>
        ⚠ These tools are for engineering validation only. They are intentionally
        isolated from the normal customer UI.
      </div>

      {/* ── Tool 1: Reset Quota ─────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="tool-section">
          <h2>1 — Reset Provider Quota</h2>
          <p>
            Simulates a payment gateway confirming subscription renewal. Resets all
            8 providers&apos; monthly quota back to 10 leads. Uses a fresh idempotency
            key each time so repeated clicks all work independently.
          </p>
          <button
            id="btn-reset-quota"
            className="btn btn-primary"
            onClick={handleResetQuota}
            disabled={quotaLoading}
          >
            {quotaLoading ? <><span className="spinner">⟳</span> Resetting…</> : "↺ Reset All Quotas to 10"}
          </button>
        </div>
        {quotaLogger.logs.length > 0 && (
          <div className="tool-log">
            {quotaLogger.logs.map((l, i) => (
              <div key={i} className={`log-entry ${l.type === "err" ? "err" : l.type === "info" ? "info" : l.type === "warn" ? "warn" : ""}`}>
                {l.msg}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Tool 2: Idempotency Test ─────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="tool-section">
          <h2>2 — Webhook Idempotency Test</h2>
          <p>
            Sends the quota-reset webhook <strong>5 times concurrently</strong> with
            the <em>same</em> idempotency key. Only 1 should process; the rest should
            be marked <code>already_processed: true</code>.
          </p>
          <button
            id="btn-idempotency-test"
            className="btn btn-warning"
            onClick={handleIdempotencyTest}
            disabled={idempLoading}
          >
            {idempLoading ? <><span className="spinner">⟳</span> Testing…</> : "⚡ Call Webhook 5× Same Key"}
          </button>
        </div>
        {idempLogger.logs.length > 0 && (
          <div className="tool-log">
            {idempLogger.logs.map((l, i) => (
              <div key={i} className={`log-entry ${l.type === "err" ? "err" : l.type === "info" ? "info" : l.type === "warn" ? "warn" : ""}`}>
                {l.msg}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Tool 3: Concurrency Test ─────────────────────────────────────── */}
      <div className="card">
        <div className="tool-section">
          <h2>3 — Concurrency Stress Test</h2>
          <p>
            Fires <strong>10 lead creation requests simultaneously</strong> with random
            customer data. Verifies that allocation logic is race-condition-free and
            provider quotas are not over-assigned. Check the dashboard after running.
          </p>
          <button
            id="btn-concurrency-test"
            className="btn btn-danger"
            onClick={handleConcurrencyTest}
            disabled={concLoading}
          >
            {concLoading ? <><span className="spinner">⟳</span> Running…</> : "🔥 Generate 10 Leads Simultaneously"}
          </button>
        </div>
        {concLogger.logs.length > 0 && (
          <div className="tool-log">
            {concLogger.logs.map((l, i) => (
              <div key={i} className={`log-entry ${l.type === "err" ? "err" : l.type === "info" ? "info" : l.type === "warn" ? "warn" : ""}`}>
                {l.msg}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
