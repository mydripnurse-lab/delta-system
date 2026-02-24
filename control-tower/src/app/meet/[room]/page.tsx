"use client";

import { useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Image from "next/image";
import styles from "./room.module.css";

function s(v: unknown) {
  return String(v ?? "").trim();
}

export default function ClientMeetingRoomPage() {
  const params = useParams<{ room: string }>();
  const sp = useSearchParams();
  const room = s(params?.room) || "delta-system-room";
  const agency = s(sp.get("agency")) || "Delta System";
  const meeting = s(sp.get("meeting")) || "Premium Client Meeting";
  const client = s(sp.get("client")) || "Guest";

  const jitsiUrl = useMemo(() => {
    const url = new URL(`https://meet.jit.si/${encodeURIComponent(room)}`);
    url.searchParams.set("config.prejoinPageEnabled", "true");
    url.searchParams.set("config.startWithAudioMuted", "false");
    url.searchParams.set("config.startWithVideoMuted", "false");
    url.searchParams.set("interfaceConfig.DISABLE_JOIN_LEAVE_NOTIFICATIONS", "true");
    return url.toString();
  }, [room]);

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
            <strong>{meeting}</strong>
          </div>
          <div>
            <span>Guest</span>
            <strong>{client}</strong>
          </div>
          <div>
            <span>Room</span>
            <strong>{room}</strong>
          </div>
        </div>
      </section>

      <section className={styles.meetingPanel}>
        <iframe
          title="Delta System Meeting"
          src={jitsiUrl}
          className={styles.frame}
          allow="camera; microphone; fullscreen; display-capture; autoplay"
        />
      </section>
    </main>
  );
}
