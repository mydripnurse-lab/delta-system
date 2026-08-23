"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { PartnerAdminShell } from "@/components/partner-admin/PartnerAdminShell";
import styles from "@/app/partner-admin/market-management/marketManagement.module.css";

type StateOption = { code: string; name: string };
type Manager = {
  userId: string;
  fullName: string;
  email: string;
  phone: string;
  status: "invited" | "active" | "suspended";
  managerCommissionRate: number;
  states: StateOption[];
  lastLoginAt: string | null;
  createdAt: string;
  completedAppointments: number;
  grossAppointmentValue: number;
  platformShareValue: number;
  earnedCommission: number;
  paidCommission: number;
  pendingCommission: number;
};

type FormState = {
  fullName: string;
  email: string;
  phone: string;
  stateCodes: string[];
  managerCommissionRate: string;
  status: "invited" | "active";
};

const EMPTY_FORM: FormState = {
  fullName: "",
  email: "",
  phone: "",
  stateCodes: [],
  managerCommissionRate: "5",
  status: "invited",
};

function formatDate(value: string | null) {
  if (!value) return "Not signed in yet";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "MM";
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value || 0);
}

export function StateMarketManagersClient() {
  const [managers, setManagers] = useState<Manager[]>([]);
  const [states, setStates] = useState<StateOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [stateSearch, setStateSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Manager | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [activationLink, setActivationLink] = useState("");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/partner-admin/market-managers", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not load Market Managers.");
      setManagers(payload.managers || []);
      setStates(payload.states || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load Market Managers.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const assignedCodes = useMemo(() => new Set(managers.flatMap((manager) => manager.states.map((state) => state.code))), [managers]);
  const visibleManagers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return managers;
    return managers.filter((manager) => [manager.fullName, manager.email, manager.phone, ...manager.states.map((state) => `${state.name} ${state.code}`)]
      .some((value) => value.toLowerCase().includes(query)));
  }, [managers, search]);
  const visibleStates = useMemo(() => {
    const query = stateSearch.trim().toLowerCase();
    return states.filter((state) => !query || `${state.name} ${state.code}`.toLowerCase().includes(query));
  }, [states, stateSearch]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setStateSearch("");
    setActivationLink("");
    setError("");
    setEditorOpen(true);
  }

  function openEdit(manager: Manager) {
    setEditing(manager);
    setForm({
      fullName: manager.fullName,
      email: manager.email,
      phone: manager.phone,
      stateCodes: manager.states.map((state) => state.code),
      managerCommissionRate: String(manager.managerCommissionRate),
      status: manager.status === "active" ? "active" : "invited",
    });
    setStateSearch("");
    setActivationLink("");
    setError("");
    setEditorOpen(true);
  }

  function toggleState(code: string) {
    setForm((current) => ({
      ...current,
      stateCodes: current.stateCodes.includes(code)
        ? current.stateCodes.filter((value) => value !== code)
        : [...current.stateCodes, code],
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const endpoint = editing ? `/api/partner-admin/market-managers/${editing.userId}` : "/api/partner-admin/market-managers";
      const response = await fetch(endpoint, {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, managerCommissionRate: Number(form.managerCommissionRate) }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not save this Market Manager.");
      if (payload.activationLink) {
        setActivationLink(payload.activationLink);
      } else {
        setEditorOpen(false);
      }
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save this Market Manager.");
    } finally {
      setBusy(false);
    }
  }

  async function suspend(manager: Manager) {
    if (!window.confirm(`Suspend ${manager.fullName}? Their historical commissions will remain intact.`)) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/partner-admin/market-managers/${manager.userId}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not suspend this Market Manager.");
      await load();
    } catch (suspendError) {
      setError(suspendError instanceof Error ? suspendError.message : "Could not suspend this Market Manager.");
    } finally {
      setBusy(false);
    }
  }

  async function copyActivationLink() {
    await navigator.clipboard.writeText(activationLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <PartnerAdminShell title="Market Managers" actions={<button type="button" className={styles.topButton} onClick={openCreate}>Add manager</button>}>
      <section className={styles.page}>
        <header className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>State operations</span>
            <h1>Market Managers</h1>
            <p>Assign one accountable manager per state while giving each person access to every market they oversee.</p>
          </div>
          <div className={styles.commissionCard}>
            <span>Manager commission</span>
            <strong>5% <small>of the 40% platform share</small></strong>
            <p>Equivalent to 2% of gross appointment value.</p>
          </div>
        </header>

        <div className={styles.metrics}>
          <article><span>Managers</span><strong>{managers.filter((manager) => manager.status !== "suspended").length}</strong><small>Active or invited</small></article>
          <article><span>Assigned markets</span><strong>{assignedCodes.size}</strong><small>One manager per state</small></article>
          <article><span>Available markets</span><strong>{Math.max(0, states.length - assignedCodes.size)}</strong><small>Ready to assign</small></article>
        </div>

        <section className={styles.directory}>
          <div className={styles.directoryHeader}>
            <div><span className={styles.eyebrow}>Access directory</span><h2>State ownership</h2></div>
            <label className={styles.search}><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search manager, email or state" /></label>
          </div>
          {error && !editorOpen ? <div className={styles.error} role="alert">{error}</div> : null}
          {loading ? <div className={styles.empty}>Loading Market Managers…</div> : null}
          {!loading && !visibleManagers.length ? (
            <div className={styles.empty}><strong>No Market Managers found.</strong><p>Add the first manager and assign one or more states.</p><button type="button" onClick={openCreate}>Add manager</button></div>
          ) : null}
          <div className={styles.managerList}>
            {visibleManagers.map((manager) => (
              <article className={styles.managerCard} key={manager.userId}>
                <div className={styles.identity}><span className={styles.avatar}>{initials(manager.fullName)}</span><div><strong>{manager.fullName}</strong><a href={`mailto:${manager.email}`}>{manager.email}</a><small>{manager.phone || "No phone added"}</small></div></div>
                <div className={styles.stateGroup}><span>Assigned states</span><div>{manager.states.length ? manager.states.map((state) => <small key={state.code}>{state.code} · {state.name}</small>) : <small>None</small>}</div></div>
                <div className={styles.managerMeta}><span className={`${styles.status} ${styles[manager.status]}`}>{manager.status}</span><strong>{money(manager.earnedCommission)} <small>earned</small></strong><span>{manager.completedAppointments} completed · {money(manager.pendingCommission)} payable</span><span>{manager.managerCommissionRate}% of platform share · {formatDate(manager.lastLoginAt)}</span></div>
                <div className={styles.actions}><button type="button" onClick={() => openEdit(manager)} disabled={busy}>Edit</button>{manager.status !== "suspended" ? <button type="button" className={styles.danger} onClick={() => void suspend(manager)} disabled={busy}>Suspend</button> : null}</div>
              </article>
            ))}
          </div>
        </section>
      </section>

      {editorOpen ? (
        <div className={styles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setEditorOpen(false); }}>
          <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="manager-editor-title">
            <header><div><span className={styles.eyebrow}>{editing ? "Access settings" : "New state access"}</span><h2 id="manager-editor-title">{editing ? "Edit Market Manager" : "Add Market Manager"}</h2><p>One person may manage several states. Each state can belong to only one manager.</p></div><button type="button" className={styles.close} onClick={() => setEditorOpen(false)} disabled={busy}>×</button></header>
            {activationLink ? (
              <div className={styles.activation}>
                <span className={styles.successIcon}>✓</span><h3>Manager created</h3><p>Send this secure link to the manager so they can set their password.</p><code>{activationLink}</code><button type="button" onClick={() => void copyActivationLink()}>{copied ? "Copied" : "Copy activation link"}</button><button type="button" className={styles.secondary} onClick={() => setEditorOpen(false)}>Done</button>
              </div>
            ) : (
              <form onSubmit={submit}>
                <div className={styles.formGrid}>
                  <label><span>Full name</span><input required value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} /></label>
                  <label><span>Email address</span><input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} disabled={Boolean(editing)} /></label>
                  <label><span>Mobile number</span><input type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
                  <label><span>Commission rate</span><div className={styles.rateInput}><input required min="0" max="100" step="0.01" type="number" value={form.managerCommissionRate} onChange={(event) => setForm({ ...form, managerCommissionRate: event.target.value })} /><b>% of platform share</b></div></label>
                  {editing ? <label><span>Account status</span><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as FormState["status"] })}><option value="invited">Invited</option><option value="active">Active</option></select></label> : null}
                </div>
                <div className={styles.statePicker}>
                  <div><span>State access</span><small>Select every state this manager will oversee.</small></div>
                  <input value={stateSearch} onChange={(event) => setStateSearch(event.target.value)} placeholder="Search states" />
                  <div className={styles.stateOptions}>
                    {visibleStates.map((state) => {
                      const selected = form.stateCodes.includes(state.code);
                      const belongsToEditing = editing?.states.some((current) => current.code === state.code);
                      const unavailable = assignedCodes.has(state.code) && !belongsToEditing;
                      return <label key={state.code} className={`${selected ? styles.selectedState : ""} ${unavailable ? styles.unavailableState : ""}`}><input type="checkbox" checked={selected} disabled={unavailable} onChange={() => toggleState(state.code)} /><span><strong>{state.code}</strong>{state.name}</span>{unavailable ? <small>Assigned</small> : null}</label>;
                    })}
                  </div>
                </div>
                <div className={styles.rateExplanation}><strong>How this is calculated</strong><span>Appointment × 40% platform share × {Number(form.managerCommissionRate || 0)}% manager rate = {(40 * Number(form.managerCommissionRate || 0) / 100).toFixed(2)}% of gross.</span></div>
                {error ? <div className={styles.error} role="alert">{error}</div> : null}
                <footer><button type="button" className={styles.secondary} onClick={() => setEditorOpen(false)} disabled={busy}>Cancel</button><button type="submit" disabled={busy || !form.stateCodes.length}>{busy ? "Saving…" : editing ? "Save access" : "Create manager"}</button></footer>
              </form>
            )}
          </section>
        </div>
      ) : null}
    </PartnerAdminShell>
  );
}
