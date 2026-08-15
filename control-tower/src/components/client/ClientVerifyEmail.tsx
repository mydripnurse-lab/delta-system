"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import styles from "@/app/client-login/clientLogin.module.css";

export default function ClientVerifyEmail() {
  const params = useSearchParams();
  const token = params.get("token") || "";
  const [status, setStatus] = useState<"working" | "success" | "error">("working");
  const [message, setMessage] = useState("Verifying your secure account…");

  useEffect(() => {
    if (!token) return;
    fetch("/api/client-auth/verify-email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    }).then(async (response) => {
      const result = await response.json().catch(() => ({})) as { error?: string; next?: string };
      if (!response.ok) throw new Error(result.error || "The verification link could not be completed.");
      setStatus("success");
      setMessage("Your email is verified. Opening your care experience…");
      window.setTimeout(() => window.location.assign(result.next || "/"), 900);
    }).catch((error) => {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "The verification link could not be completed.");
    });
  }, [token]);

  const visibleStatus = token ? status : "error";
  const visibleMessage = token ? message : "This verification link is invalid.";

  return (
    <div className={styles.verificationCard}>
      <span className={`${styles.verificationIcon} ${styles[visibleStatus]}`} aria-hidden="true">
        {visibleStatus === "working" ? "⋯" : visibleStatus === "success" ? "✓" : "!"}
      </span>
      <span>Secure patient access</span>
      <h1>{visibleStatus === "success" ? "You’re all set." : visibleStatus === "error" ? "We need a fresh link." : "One moment."}</h1>
      <p>{visibleMessage}</p>
      {visibleStatus === "error" ? <a href="/login">Return to sign in</a> : null}
    </div>
  );
}
