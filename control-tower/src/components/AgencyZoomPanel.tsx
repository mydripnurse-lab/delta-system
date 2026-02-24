"use client";

import { useEffect, useMemo, useState } from "react";

type ZoomMeeting = {
  id: string;
  title: string;
  clientName: string;
  clientEmail: string;
  startsAt: string;
  durationMinutes: number;
  roomSlug: string;
  joinUrl: string;
  createdAt: string;
};

const STORAGE_KEY = "delta_zoom_meetings_v1";

function s(v: unknown) {
  return String(v ?? "").trim();
}

function slugify(input: string) {
  return s(input)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function randomToken() {
  return Math.random().toString(36).slice(2, 8);
}

function formatDateTime(iso: string) {
  if (!s(iso)) return "Now";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString();
}

export default function AgencyZoomPanel() {
  const [meetings, setMeetings] = useState<ZoomMeeting[]>([]);
  const [title, setTitle] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [copyMsg, setCopyMsg] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as ZoomMeeting[]) : [];
      if (Array.isArray(parsed)) setMeetings(parsed);
    } catch {
      setMeetings([]);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(meetings));
  }, [meetings]);

  const sortedMeetings = useMemo(
    () =>
      [...meetings].sort((a, b) => {
        const aTime = new Date(a.startsAt || a.createdAt).getTime();
        const bTime = new Date(b.startsAt || b.createdAt).getTime();
        return bTime - aTime;
      }),
    [meetings],
  );

  function createMeeting() {
    if (typeof window === "undefined") return;
    const cleanTitle = s(title) || "Client Strategy Call";
    const cleanClientName = s(clientName) || "Client";
    const cleanClientEmail = s(clientEmail);
    const roomSlug = `${slugify(cleanTitle)}-${randomToken()}`;
    const url = new URL(`/meet/${roomSlug}`, window.location.origin);
    url.searchParams.set("agency", "Delta System");
    url.searchParams.set("meeting", cleanTitle);
    url.searchParams.set("client", cleanClientName);
    if (cleanClientEmail) url.searchParams.set("email", cleanClientEmail);
    const row: ZoomMeeting = {
      id: `${Date.now()}-${randomToken()}`,
      title: cleanTitle,
      clientName: cleanClientName,
      clientEmail: cleanClientEmail,
      startsAt: s(startsAt),
      durationMinutes: Number.isFinite(durationMinutes) ? Math.max(15, Math.min(180, durationMinutes)) : 45,
      roomSlug,
      joinUrl: url.toString(),
      createdAt: new Date().toISOString(),
    };
    setMeetings((prev) => [row, ...prev]);
    setCopyMsg("");
  }

  async function copyLink(url: string) {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setCopyMsg("Link copied.");
        return;
      }
      setCopyMsg("Clipboard API not available.");
    } catch {
      setCopyMsg("Could not copy link.");
    }
  }

  return (
    <section className="agencyProjectsCard agencyZoomBoard">
      <div className="agencyProjectsHeader">
        <div>
          <h2>Zoom</h2>
          <p>Create premium client video calls. Delta System link is generated automatically.</p>
        </div>
      </div>

      <div className="agencyZoomHero">
        <div>
          <h3>Delta Cinema Meetings</h3>
          <p>Google Meet + Zoom workflow with Apple/Netflix visual style for both agency and client.</p>
        </div>
        <div className="agencyPill">Brand: Delta System</div>
      </div>

      <div className="agencyZoomCreateGrid">
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
        <button type="button" className="btnGhost agencyZoomPrimaryBtn" onClick={createMeeting}>
          Create Meeting
        </button>
      </div>

      {copyMsg ? <div className="okText">{copyMsg}</div> : null}

      <div className="agencyZoomList">
        {sortedMeetings.length === 0 ? <div className="mutedText">No meetings yet. Create your first premium room.</div> : null}
        {sortedMeetings.map((meeting) => (
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
            <div className="agencyZoomLinkWrap">
              <input className="input agencyZoomLinkInput" value={meeting.joinUrl} readOnly />
            </div>
            <div className="agencyZoomActions">
              <button type="button" className="btnGhost" onClick={() => void copyLink(meeting.joinUrl)}>
                Copy Link
              </button>
              <a className="btnGhost" href={meeting.joinUrl} target="_blank" rel="noreferrer">
                Open Client View
              </a>
              <a
                className="btnGhost agencyZoomPrimaryBtn"
                href={`https://meet.jit.si/${encodeURIComponent(meeting.roomSlug)}`}
                target="_blank"
                rel="noreferrer"
              >
                Start Call
              </a>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
