"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function s(v: unknown) {
  return String(v ?? "").trim();
}

function ActivatePageInner() {
  const search = useSearchParams();
  const router = useRouter();
  const token = useMemo(() => s(search.get("token")), [search]);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  async function submit() {
    if (!token) {
      setError("Missing activation token.");
      return;
    }
    if (s(password) !== s(confirmPassword)) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    setOk("");
    try {
      const res = await fetch("/api/auth/activate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password: s(password) }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setOk("Password updated. Redirecting to login...");
      setTimeout(() => router.push("/login"), 1100);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Activation failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="agencyRoot">
      <section className="agencyProjectsCard agencyMenuSection" style={{ maxWidth: 560, margin: "48px auto" }}>
        <div className="agencyProjectsHeader">
          <div>
            <h2>Activate Account</h2>
            <p>Set your new password to complete the invite process.</p>
          </div>
        </div>
        <div className="agencySettingsGrid">
          <label className="agencyField">
            <span className="agencyFieldLabel">New password</span>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 10 chars, uppercase, lowercase, number"
            />
          </label>
          <label className="agencyField">
            <span className="agencyFieldLabel">Confirm password</span>
            <input className="input" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          </label>
        </div>
        {error ? <div className="errorText">{error}</div> : null}
        {ok ? <div className="okText">{ok}</div> : null}
        <div className="agencyCreateActions">
          <button className="btnPrimary" type="button" disabled={busy} onClick={() => void submit()}>
            {busy ? "Saving..." : "Activate account"}
          </button>
        </div>
      </section>
    </main>
  );
}

function ActivateFallback() {
  return (
    <main className="agencyRoot">
      <section className="agencyProjectsCard agencyMenuSection" style={{ maxWidth: 560, margin: "48px auto" }}>
        <div className="agencyProjectsHeader">
          <div>
            <h2>Activate Account</h2>
            <p>Loading activation form...</p>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function ActivatePage() {
  return (
    <Suspense fallback={<ActivateFallback />}>
      <ActivatePageInner />
    </Suspense>
  );
}
