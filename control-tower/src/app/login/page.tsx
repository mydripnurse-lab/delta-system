"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

function s(v: unknown) {
  return String(v ?? "").trim();
}

export default function LoginPage() {
  const router = useRouter();
  const [nextPath, setNextPath] = useState("/");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
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
    const nextPassword = s(password);
    if (!nextEmail || !nextPassword) {
      setError("Email y password son requeridos.");
      return;
    }
    if (mode === "register" && nextPassword !== s(confirmPassword)) {
      setError("El confirm password no coincide.");
      return;
    }

    setBusy(true);
    try {
      const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
      const payload =
        mode === "register"
          ? { email: nextEmail, fullName: s(fullName), password: nextPassword }
          : { email: nextEmail, password: nextPassword, rememberMe };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
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
          Acceso seguro con email y password.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => setMode("login")}
            style={{
              flex: 1,
              border: "1px solid #ccc",
              borderRadius: 8,
              padding: "8px 10px",
              background: mode === "login" ? "#f1f5ff" : "#fff",
              cursor: "pointer",
            }}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => setMode("register")}
            style={{
              flex: 1,
              border: "1px solid #ccc",
              borderRadius: 8,
              padding: "8px 10px",
              background: mode === "register" ? "#f1f5ff" : "#fff",
              cursor: "pointer",
            }}
          >
            Crear Cuenta
          </button>
        </div>
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
          <span style={{ fontSize: 13 }}>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="********"
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            required
            style={{ border: "1px solid #ccc", borderRadius: 8, padding: "10px 12px" }}
          />
        </label>
        {mode === "register" ? (
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13 }}>Confirm Password</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="********"
              autoComplete="new-password"
              required
              style={{ border: "1px solid #ccc", borderRadius: 8, padding: "10px 12px" }}
            />
          </label>
        ) : null}
        {mode === "register" ? (
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13 }}>Nombre (opcional)</span>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nombre Apellido"
              style={{ border: "1px solid #ccc", borderRadius: 8, padding: "10px 12px" }}
            />
          </label>
        ) : null}
        {mode === "login" ? (
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: "#5f6368" }}>
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
            />
            Remember me (30 dias)
          </label>
        ) : null}
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
          {busy ? "Procesando..." : mode === "register" ? "Crear Cuenta" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
