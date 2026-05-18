"use client";

import { useState } from "react";

const SERVICES = [
  { id: 1, name: "Service 1" },
  { id: 2, name: "Service 2" },
  { id: 3, name: "Service 3" },
];

export default function RequestServicePage() {
  const [form, setForm] = useState({
    customer_name: "",
    phone: "",
    city: "",
    service_id: "",
    description: "",
  });
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [leadId, setLeadId] = useState("");

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setMessage("");

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, service_id: Number(form.service_id) }),
      });
      const data = await res.json();

      if (res.ok) {
        setStatus("success");
        setLeadId(data.lead_id);
        setMessage("Your service request has been submitted successfully. Providers have been notified.");
        setForm({ customer_name: "", phone: "", city: "", service_id: "", description: "" });
      } else {
        setStatus("error");
        setMessage(data.error || "Something went wrong. Please try again.");
      }
    } catch {
      setStatus("error");
      setMessage("Network error. Please check your connection and try again.");
    }
  }

  return (
    <div className="page-wrap">
      <div className="page-header">
        <h1>Request a Service</h1>
        <p>Fill in the form below and we will match you with the right providers.</p>
      </div>

      <div className="card">
        {status === "success" && (
          <div className="alert alert-success" style={{ marginBottom: 24 }}>
            ✓ {message}
            {leadId && (
              <div className="mt-2 text-sm font-mono" style={{ opacity: 0.7 }}>
                Lead ID: {leadId}
              </div>
            )}
          </div>
        )}
        {status === "error" && (
          <div className="alert alert-error" style={{ marginBottom: 24 }}>
            ✕ {message}
          </div>
        )}

        <form className="form" onSubmit={handleSubmit} id="service-request-form">
          <div className="field-row">
            <div className="field">
              <label htmlFor="customer_name">Full Name</label>
              <input
                id="customer_name"
                name="customer_name"
                type="text"
                placeholder="John Smith"
                value={form.customer_name}
                onChange={handleChange}
                required
                autoComplete="name"
              />
            </div>
            <div className="field">
              <label htmlFor="phone">Phone Number</label>
              <input
                id="phone"
                name="phone"
                type="tel"
                placeholder="9999999999"
                value={form.phone}
                onChange={handleChange}
                required
                autoComplete="tel"
              />
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="city">City</label>
              <input
                id="city"
                name="city"
                type="text"
                placeholder="Mumbai"
                value={form.city}
                onChange={handleChange}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="service_id">Service Type</label>
              <select
                id="service_id"
                name="service_id"
                value={form.service_id}
                onChange={handleChange}
                required
              >
                <option value="">— Select a service —</option>
                {SERVICES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              name="description"
              placeholder="Describe what you need help with..."
              value={form.description}
              onChange={handleChange}
              required
            />
          </div>

          <button
            id="submit-service-request"
            type="submit"
            className="btn btn-primary btn-full"
            disabled={status === "loading"}
          >
            {status === "loading" ? (
              <>
                <span className="spinner">⟳</span> Submitting…
              </>
            ) : (
              "Submit Request"
            )}
          </button>
        </form>
      </div>

      <div className="alert alert-info mt-4">
        <strong>Note:</strong> The same phone number cannot submit a duplicate request for the same service type.
      </div>
    </div>
  );
}
