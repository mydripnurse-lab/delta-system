"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

function s(v: unknown) {
  return String(v ?? "").trim();
}

export default function LoginPage() {
  const router = useRouter();
  const [nextPath, setNextPath] = useState("/");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = s(params.get("next")) || "/";
    setNextPath(next.startsWith("/") ? next : "/");
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const nextEmail = s(email).toLowerCase();
    if (!nextEmail) {
      setError("Email es requerido.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: nextEmail, fullName: s(fullName) }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) {
        setError(s(json?.error) || "No se pudo iniciar sesion.");
        return;
      }
      router.push(nextPath.startsWith("/") ? nextPath : "/");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <form
        onSubmit={onSubmit}
        style={{
          width: "100%",
          maxWidth: 420,
          border: "1px solid #d9d9d9",
          borderRadius: 12,
          padding: 20,
          display: "grid",
          gap: 12,
          background: "#fff",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 20 }}>Iniciar Sesion</h1>
        <p style={{ margin: 0, color: "#5f6368", fontSize: 13 }}>
          Usa tu email de `app.users` (en dev puede autocrearse si `DEV_AUTH_AUTO_CREATE=1`).
        </p>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 13 }}>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            autoComplete="email"
            required
            style={{ border: "1px solid #ccc", borderRadius: 8, padding: "10px 12px" }}
          />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 13 }}>Nombre (opcional)</span>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Nombre Apellido"
            style={{ border: "1px solid #ccc", borderRadius: 8, padding: "10px 12px" }}
          />
        </label>
        {error ? <div style={{ color: "#b42318", fontSize: 13 }}>{error}</div> : null}
        <button
          type="submit"
          disabled={busy}
          style={{
            border: "none",
            borderRadius: 8,
            padding: "10px 14px",
            background: "#1f6feb",
            color: "#fff",
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </main>
  );
}
