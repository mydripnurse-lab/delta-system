"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

type MeetingRow = {
  id: string;
  title: string;
  clientName: string;
  clientEmail: string;
  startsAt: string;
  durationMinutes: number;
  roomSlug: string;
  joinUrl: string;
  hostJoinUrl: string;
  roomPasscode: string;
  lobbyEnabled: boolean;
  createdAt: string;
  createdBy: string;
};

function s(v: unknown) {
  return String(v ?? "").trim();
}

function formatDateTime(iso: string) {
  if (!s(iso)) return "No date selected";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString();
}

async function safeJson(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export default function AgencyMeetingsPanel() {
  const [rows, setRows] = useState<MeetingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const [title, setTitle] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(45);

  const upcoming = useMemo(() => {
    const now = Date.now();
    return rows.filter((row) => {
      const d = new Date(row.startsAt).getTime();
      return Number.isFinite(d) ? d >= now : false;
    }).length;
  }, [rows]);

  async function loadMeetings() {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/agency/meetings", { cache: "no-store" });
      const data = (await safeJson(res)) as { ok?: boolean; rows?: MeetingRow[]; error?: string } | null;
      if (!res.ok || !data?.ok) throw new Error(s(data?.error) || `HTTP ${res.status}`);
      setRows(Array.isArray(data.rows) ? data.rows : []);
    } catch (error: unknown) {
      setErr(error instanceof Error ? error.message : "Failed to load meetings.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMeetings();
  }, []);

  async function createMeeting(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    setOk("");
    try {
      const res = await fetch("/api/agency/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: s(title) || "Client Strategy Call",
          clientName: s(clientName) || "Client",
          clientEmail: s(clientEmail),
          startsAt: s(startsAt),
          durationMinutes: Number(durationMinutes || 45),
        }),
      });
      const data = (await safeJson(res)) as { ok?: boolean; meeting?: MeetingRow; error?: string } | null;
      if (!res.ok || !data?.ok || !data.meeting) throw new Error(s(data?.error) || `HTTP ${res.status}`);
      setRows((prev) => [data.meeting as MeetingRow, ...prev]);
      setOk("Meeting created. Link ready to send.");
    } catch (error: unknown) {
      setErr(error instanceof Error ? error.message : "Failed to create meeting.");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink(url: string) {
    setErr("");
    try {
      if (!navigator?.clipboard?.writeText) {
        setOk("Clipboard not available in this browser.");
        return;
      }
      await navigator.clipboard.writeText(url);
      setOk("Link copied.");
    } catch {
      setErr("Could not copy link.");
    }
  }

  async function deleteMeeting(id: string) {
    setBusy(true);
    setErr("");
    setOk("");
    try {
      const res = await fetch(`/api/agency/meetings/${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = (await safeJson(res)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) throw new Error(s(data?.error) || `HTTP ${res.status}`);
      setRows((prev) => prev.filter((row) => row.id !== id));
      setOk("Meeting deleted.");
    } catch (error: unknown) {
      setErr(error instanceof Error ? error.message : "Failed to delete meeting.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="agencyProjectsCard agencyZoomBoard">
      <div className="agencyProjectsHeader">
        <div>
          <h2>Meetings</h2>
          <p>Delta Rooms by Delta System. Premium client calls with persistent links in your agency account.</p>
        </div>
        <div className="agencyProjectStats">
          <div className="agencyPill">Total: {rows.length}</div>
          <div className="agencyPill">Upcoming: {upcoming}</div>
        </div>
      </div>

      <div className="agencyZoomHero">
        <div>
          <h3>Delta Rooms</h3>
          <p>Apple-grade clarity + streaming-style atmosphere. Meeting links are now saved in DB per agency account.</p>
        </div>
        <div className="agencyPill">Engine: Jitsi</div>
      </div>

      <form className="agencyZoomCreateGrid" onSubmit={createMeeting}>
        <input className="input" placeholder="Meeting title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className="input" placeholder="Client name" value={clientName} onChange={(e) => setClientName(e.target.value)} />
        <input className="input" placeholder="Client email (optional)" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
        <input className="input" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        <input
          className="input"
          type="number"
          min={15}
          max={180}
          step={15}
          value={durationMinutes}
          onChange={(e) => setDurationMinutes(Number(e.target.value) || 45)}
        />
        <button type="submit" className="btnGhost agencyZoomPrimaryBtn" disabled={busy}>
          {busy ? "Creating..." : "Create Meeting"}
        </button>
      </form>

      {loading ? <div className="mutedText">Loading meetings...</div> : null}
      {err ? <div className="errorText">{err}</div> : null}
      {ok ? <div className="okText">{ok}</div> : null}

      <div className="agencyZoomList">
        {!loading && rows.length === 0 ? <div className="mutedText">No meetings yet. Create your first Delta Room.</div> : null}
        {rows.map((meeting) => (
          <article key={meeting.id} className="agencyZoomCard">
            <div className="agencyZoomCardTop">
              <div>
                <h4>{meeting.title}</h4>
                <p>
                  {meeting.clientName}
                  {s(meeting.clientEmail) ? ` · ${meeting.clientEmail}` : ""}
                </p>
              </div>
              <div className="agencyPill">{meeting.durationMinutes} min</div>
            </div>
            <div className="agencyZoomMeta">Starts: {formatDateTime(meeting.startsAt)}</div>
            <div className="agencyZoomMeta">Created by: {meeting.createdBy}</div>
            <div className="agencyZoomMeta">Security: {meeting.lobbyEnabled ? "Lobby on" : "Lobby off"} · PIN {meeting.roomPasscode}</div>
            <div className="agencyZoomLinkWrap">
              <input className="input agencyZoomLinkInput" value={meeting.joinUrl} readOnly />
            </div>
            <div className="agencyZoomActions">
              <button type="button" className="btnGhost" onClick={() => void copyLink(meeting.joinUrl)}>
                Copy Client Link
              </button>
              <button type="button" className="btnGhost" onClick={() => void copyLink(meeting.hostJoinUrl)}>
                Copy Host Link
              </button>
              <a className="btnGhost" href={meeting.joinUrl} target="_blank" rel="noreferrer">
                Open Client View
              </a>
              <a className="btnGhost agencyZoomPrimaryBtn" href={meeting.hostJoinUrl} target="_blank" rel="noreferrer">
                Open Host View
              </a>
              <button type="button" className="btnGhost" disabled={busy} onClick={() => void deleteMeeting(meeting.id)}>
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
