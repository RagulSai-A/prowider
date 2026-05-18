"use client";

import { useEffect, useState, useCallback, useRef } from "react";

interface LeadData {
  id: string;
  customer_name: string;
  phone: string;
  city: string;
  service_id: number;
  description: string;
  created_at: string;
}

interface AssignmentData {
  assignment_id: string;
  assigned_at: string;
  lead: LeadData;
}

interface ProviderData {
  id: number;
  name: string;
  monthly_quota: number;
  leads_received: number;
  quota_remaining: number;
  leads: AssignmentData[];
}

const SERVICE_NAMES: Record<number, string> = {
  1: "Service 1",
  2: "Service 2",
  3: "Service 3",
};

export default function DashboardPage() {
  const [providers, setProviders] = useState<ProviderData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [liveStatus, setLiveStatus] = useState<"connecting" | "live" | "disconnected">("connecting");
  const [flashIds, setFlashIds] = useState<Set<number>>(new Set());
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const fetchProviders = useCallback(async (flashAll?: boolean) => {
    try {
      const res = await fetch("/api/providers", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch");
      const data: ProviderData[] = await res.json();
      setProviders(data);
      setLastUpdate(new Date());
      if (flashAll) {
        const ids = new Set(data.map((p) => p.id));
        setFlashIds(ids);
        setTimeout(() => setFlashIds(new Set()), 1500);
      }
    } catch {
      setError("Could not load provider data. Please refresh.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial data load
  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  // SSE connection for real-time updates
  useEffect(() => {
    const es = new EventSource("/api/sse");
    eventSourceRef.current = es;

    es.addEventListener("connected", () => {
      setLiveStatus("live");
    });

    es.addEventListener("new_assignment", () => {
      // Re-fetch providers and flash updated cards
      fetchProviders(true);
    });

    es.onerror = () => {
      setLiveStatus("disconnected");
      // Auto-reconnect is handled by the browser for EventSource
    };

    es.onopen = () => {
      setLiveStatus("live");
    };

    return () => {
      es.close();
    };
  }, [fetchProviders]);

  function flashProvider(providerId: number) {
    setFlashIds((prev) => new Set([...prev, providerId]));
    setTimeout(() => {
      setFlashIds((prev) => {
        const next = new Set(prev);
        next.delete(providerId);
        return next;
      });
    }, 1500);
  }
  // Keep flashProvider in scope (suppress unused warning)
  void flashProvider;

  if (loading) {
    return (
      <div className="page-wrap-wide">
        <div className="page-header">
          <h1>Provider Dashboard</h1>
        </div>
        <div className="alert alert-info">
          <span className="spinner">⟳</span> Loading provider data…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-wrap-wide">
        <div className="page-header">
          <h1>Provider Dashboard</h1>
        </div>
        <div className="alert alert-error">{error}</div>
      </div>
    );
  }

  return (
    <div className="page-wrap-wide">
      <div className="page-header">
        <h1>Provider Dashboard</h1>
        <p>Real-time view of all providers, their quota, and assigned leads.</p>
      </div>

      {/* Live status bar */}
      <div className="flex items-center justify-between" style={{ marginBottom: 24 }}>
        <div className="status-bar">
          <span className={`status-dot ${liveStatus === "live" ? "live" : ""}`} />
          {liveStatus === "live" && "Live — auto-updates when new leads are assigned"}
          {liveStatus === "connecting" && "Connecting to live feed…"}
          {liveStatus === "disconnected" && "Disconnected — reconnecting…"}
        </div>
        <div className="flex items-center gap-3">
          {lastUpdate && (
            <span className="text-muted text-sm">
              Updated: {lastUpdate.toLocaleTimeString()}
            </span>
          )}
          <button
            id="refresh-dashboard"
            className="btn btn-secondary"
            style={{ padding: "6px 14px", fontSize: "0.8rem" }}
            onClick={() => fetchProviders(false)}
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 16,
          marginBottom: 32,
        }}
      >
        {[
          {
            label: "Total Providers",
            value: providers.length,
            color: "var(--accent)",
          },
          {
            label: "Total Leads Assigned",
            value: providers.reduce((s, p) => s + p.leads_received, 0),
            color: "var(--success)",
          },
          {
            label: "Providers at Quota",
            value: providers.filter((p) => p.quota_remaining === 0).length,
            color: "var(--warning)",
          },
        ].map((stat) => (
          <div className="card" key={stat.label} style={{ padding: "18px 22px" }}>
            <div
              style={{
                fontSize: "1.8rem",
                fontWeight: 700,
                color: stat.color,
                letterSpacing: "-0.03em",
              }}
            >
              {stat.value}
            </div>
            <div className="text-muted text-sm" style={{ marginTop: 4 }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* Provider cards */}
      <div className="provider-grid">
        {providers.map((provider) => {
          const pct = Math.round(
            (provider.leads_received / provider.monthly_quota) * 100
          );
          const isLow = provider.quota_remaining <= 2;
          const isFlashing = flashIds.has(provider.id);

          return (
            <div
              key={provider.id}
              className={`provider-card${isFlashing ? " flash" : ""}`}
              id={`provider-card-${provider.id}`}
            >
              <div className="provider-header">
                <div className="provider-name">{provider.name}</div>
                <span
                  className={`badge ${provider.quota_remaining === 0 ? "badge-red" : isLow ? "" : "badge-green"}`}
                  style={
                    !isLow && provider.quota_remaining > 0
                      ? {}
                      : isLow && provider.quota_remaining > 0
                      ? {
                          background: "var(--warning-dim)",
                          color: "var(--warning)",
                        }
                      : {}
                  }
                >
                  {provider.quota_remaining === 0
                    ? "Quota Full"
                    : `${provider.quota_remaining} left`}
                </span>
              </div>

              <div className="quota-bar-wrap">
                <div className="quota-label">
                  <span>
                    {provider.leads_received} / {provider.monthly_quota} leads
                  </span>
                  <span>{pct}%</span>
                </div>
                <div className="quota-bar">
                  <div
                    className={`quota-fill${isLow ? " low" : ""}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              <div className="leads-list">
                <div className="leads-list-title">
                  Assigned Leads ({provider.leads.length})
                </div>
                {provider.leads.length === 0 ? (
                  <div className="empty-leads">No leads assigned yet</div>
                ) : (
                  provider.leads.map((a) => (
                    <div key={a.assignment_id} className="lead-item">
                      <div className="lead-item-name">{a.lead.customer_name}</div>
                      <div className="lead-item-meta">
                        📞 {a.lead.phone} · 📍 {a.lead.city}
                      </div>
                      <span className="lead-item-service">
                        {SERVICE_NAMES[a.lead.service_id] ?? `Service ${a.lead.service_id}`}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
