"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Image from "next/image";
import styles from "./room.module.css";

function s(v: unknown) {
  return String(v ?? "").trim();
}

type BootstrapResponse = {
  ok?: boolean;
  title?: string;
  host?: boolean;
  lobbyEnabled?: boolean;
  roomPasscode?: string;
  error?: string;
};

type JitsiApi = {
  addListener: (event: string, cb: (...args: unknown[]) => void) => void;
  executeCommand: (command: string, ...args: unknown[]) => void;
  dispose: () => void;
};

type JitsiCtor = new (
  domain: string,
  options: {
    roomName: string;
    parentNode: HTMLElement;
    width: string;
    height: string;
    userInfo?: { displayName?: string };
    configOverwrite?: Record<string, unknown>;
    interfaceConfigOverwrite?: Record<string, unknown>;
  },
) => JitsiApi;

declare global {
  interface Window {
    JitsiMeetExternalAPI?: JitsiCtor;
  }
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

function loadJitsiScript() {
  return new Promise<void>((resolve, reject) => {
    if (typeof window !== "undefined" && window.JitsiMeetExternalAPI) {
      resolve();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>('script[data-jitsi-external="1"]');
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Jitsi script.")));
      return;
    }
    const script = document.createElement("script");
    script.src = "https://meet.jit.si/external_api.js";
    script.async = true;
    script.dataset.jitsiExternal = "1";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Jitsi script."));
    document.head.appendChild(script);
  });
}

export default function ClientMeetingRoomPage() {
  const params = useParams<{ room: string }>();
  const sp = useSearchParams();
  const room = s(params?.room) || "delta-system-room";
  const agency = s(sp.get("agency")) || "Delta System";
  const meetingFromUrl = s(sp.get("meeting")) || "Premium Client Meeting";
  const client = s(sp.get("client")) || "Guest";
  const hostKey = s(sp.get("hk"));

  const mountRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<JitsiApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState(meetingFromUrl);
  const [securityState, setSecurityState] = useState("Protected mode enabled.");

  useEffect(() => {
    let disposed = false;
    async function boot() {
      setLoading(true);
      setError("");
      try {
        const qs = hostKey ? `?hk=${encodeURIComponent(hostKey)}` : "";
        const bootstrapRes = await fetch(`/api/public/meet/${encodeURIComponent(room)}/bootstrap${qs}`, { cache: "no-store" });
        const bootstrap = (await safeJson(bootstrapRes)) as BootstrapResponse | null;
        if (!bootstrapRes.ok || !bootstrap?.ok) throw new Error(s(bootstrap?.error) || `HTTP ${bootstrapRes.status}`);

        if (disposed) return;
        const host = Boolean(bootstrap.host);
        const lobbyEnabled = Boolean(bootstrap.lobbyEnabled);
        const roomPasscode = s(bootstrap.roomPasscode);
        setIsHost(host);
        setMeetingTitle(s(bootstrap.title) || meetingFromUrl);
        setSecurityState(host ? "Host mode: lobby + PIN will auto-apply." : "Guest mode: wait for host if room is locked.");

        await loadJitsiScript();
        if (disposed || !mountRef.current || !window.JitsiMeetExternalAPI) return;
        if (apiRef.current) {
          apiRef.current.dispose();
          apiRef.current = null;
        }

        const api = new window.JitsiMeetExternalAPI("meet.jit.si", {
          roomName: room,
          parentNode: mountRef.current,
          width: "100%",
          height: "100%",
          userInfo: { displayName: host ? "Delta Host" : client },
          configOverwrite: {
            prejoinPageEnabled: false,
            disableDeepLinking: true,
            startWithAudioMuted: false,
            startWithVideoMuted: false,
            enableWelcomePage: false,
            disableInviteFunctions: true,
          },
          interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            HIDE_DEEP_LINKING_LOGO: true,
            DEFAULT_LOGO_URL: "",
            MOBILE_APP_PROMO: false,
          },
        });
        apiRef.current = api;

        api.addListener("videoConferenceJoined", () => {
          if (!host) return;
          try {
            if (roomPasscode) api.executeCommand("password", roomPasscode);
          } catch {}
          try {
            if (lobbyEnabled) api.executeCommand("toggleLobby", true);
          } catch {}
        });

        if (!disposed) setLoading(false);
      } catch (e: unknown) {
        if (disposed) return;
        setError(e instanceof Error ? e.message : "Failed to load meeting.");
        setLoading(false);
      }
    }

    void boot();
    return () => {
      disposed = true;
      if (apiRef.current) {
        apiRef.current.dispose();
        apiRef.current = null;
      }
    };
  }, [room, hostKey, client, meetingFromUrl]);

  return (
    <main className={styles.shell}>
      <div className={styles.heroBackdrop} />
      <section className={styles.headerCard}>
        <div className={styles.brand}>
          <Image src="/delta-icon.svg" alt="Delta System" width={42} height={42} />
          <div>
            <h1>{agency}</h1>
            <p>Premium Meeting Lounge</p>
          </div>
        </div>
        <div className={styles.info}>
          <div>
            <span>Meeting</span>
            <strong>{meetingTitle}</strong>
          </div>
          <div>
            <span>Role</span>
            <strong>{isHost ? "Host" : "Guest"}</strong>
          </div>
          <div>
            <span>Room</span>
            <strong>{room}</strong>
          </div>
        </div>
        <div className={styles.securityPill}>{securityState}</div>
      </section>

      <section className={styles.meetingPanel}>
        {loading ? <div className={styles.loadingState}>Loading secure room...</div> : null}
        {error ? <div className={styles.errorState}>{error}</div> : null}
        <div ref={mountRef} className={styles.frame} style={loading || error ? { display: "none" } : undefined} />
      </section>
    </main>
  );
}
