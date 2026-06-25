"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function sanitizeNextPath(raw) {
  if (typeof raw !== "string" || !raw.startsWith("/")) return "/";
  if (raw.startsWith("//")) return "/";
  if (raw === "/access" || raw.startsWith("/access?")) return "/";
  return raw;
}

export default function AccessPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitCode(event) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      const rawNext = typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("next")
        : "/";
      const nextPath = sanitizeNextPath(rawNext || "/");
      router.replace(nextPath);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to verify code.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="container access-container">
      <header>
        <h1>Voice → Post</h1>
        <span className="subtitle">введите код доступа</span>
      </header>

      <section className="access-card">
        <p className="access-hint">
          Этот проект защищен кодом. Запроси код у владельца и введи его ниже.
        </p>
        <form className="access-form" onSubmit={submitCode}>
          <input
            className="style-name-input"
            type="password"
            autoComplete="one-time-code"
            placeholder="код доступа"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            disabled={isSubmitting}
          />
          <button className="btn btn-primary" type="submit" disabled={!code.trim() || isSubmitting}>
            {isSubmitting ? "проверяю..." : "продолжить"}
          </button>
        </form>
        {error ? <p className="access-error">{error}</p> : null}
      </section>
    </div>
  );
}
