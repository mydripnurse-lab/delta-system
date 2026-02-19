"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./login.module.css";

const BRAND_ICON_URL =
  "https://storage.googleapis.com/msgsndr/K8GcSVZWinRaQTMF6Sb8/media/698c5030a41b87368f94ef80.png";

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
    <main className={styles.page}>
      <section className={styles.grid}>
        <aside className={styles.hero}>
          <div>
            <div className={styles.brand}>
              <img src={BRAND_ICON_URL} alt="Delta System" />
              <p className={styles.brandTitle}>Delta System</p>
            </div>
            <h1 className={styles.headline}>Control seguro para agencias que operan en serio.</h1>
            <p className={styles.subhead}>
              Acceso unificado, sesiones protegidas y gobierno por roles para equipos multi-tenant.
            </p>
            <div className={styles.chips}>
              <span className={styles.chip}>Role-Based Access</span>
              <span className={styles.chip}>Tenant Isolation</span>
              <span className={styles.chip}>Audit Ready</span>
            </div>
          </div>
        </aside>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>{mode === "register" ? "Crear Cuenta" : "Iniciar Sesion"}</h2>
          <p className={styles.cardCopy}>Diseñado para equipos de alto rendimiento, con seguridad por defecto.</p>

          <div className={styles.tabs}>
            <button
              type="button"
              onClick={() => setMode("login")}
              className={`${styles.tab} ${mode === "login" ? styles.tabOn : ""}`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => setMode("register")}
              className={`${styles.tab} ${mode === "register" ? styles.tabOn : ""}`}
            >
              Crear Cuenta
            </button>
          </div>

          <form onSubmit={onSubmit} className={styles.form}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Email</span>
              <input
                className={styles.input}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                required
              />
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Password</span>
              <input
                className={styles.input}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="********"
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                required
              />
            </label>

            {mode === "register" ? (
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Confirm Password</span>
                <input
                  className={styles.input}
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="********"
                  autoComplete="new-password"
                  required
                />
              </label>
            ) : null}

            {mode === "register" ? (
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Nombre (opcional)</span>
                <input
                  className={styles.input}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Nombre Apellido"
                />
              </label>
            ) : null}

            {mode === "login" ? (
              <label className={styles.remember}>
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                Remember me (30 dias)
              </label>
            ) : null}

            {error ? <div className={styles.error}>{error}</div> : null}

            <button type="submit" disabled={busy} className={styles.submit}>
              {busy ? "Procesando..." : mode === "register" ? "Crear Cuenta" : "Entrar"}
            </button>
          </form>

          <p className={styles.hint}>
            Solo usuarios autorizados. Todas las acciones quedan sujetas a control de permisos y auditoria.
          </p>
        </section>
      </section>
    </main>
  );
}
