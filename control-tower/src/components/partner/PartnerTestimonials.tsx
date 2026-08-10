"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import styles from "./partnerTestimonials.module.css";

type ResizableIframe = HTMLIFrameElement & {
  iFrameResizer?: { close: () => void };
};

declare global {
  interface Window {
    iFrameResize?: (
      options: { warningTimeout: number; log: boolean; checkOrigin: boolean },
      target: string | HTMLIFrameElement,
    ) => void;
  }
}

const BONJORO_FRAME_ID = "p-38b7a548-411d-46d8-a89c-6f207a22a7b8";

export function PartnerTestimonials() {
  const frameRef = useRef<ResizableIframe>(null);
  const [frameVersion, setFrameVersion] = useState(0);

  const resizeFrame = useCallback(() => {
    if (!window.iFrameResize || !frameRef.current || frameRef.current.iFrameResizer) return;
    window.iFrameResize(
      { warningTimeout: 30000, log: false, checkOrigin: false },
      frameRef.current,
    );
  }, []);

  useEffect(() => {
    // Safari and mobile browsers can restore the page from the back/forward
    // cache without re-running the third-party iframe's document lifecycle.
    // Remounting the frame gives Bonjoro a fresh navigation instead of leaving
    // the reserved card blank after the user taps Back.
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setFrameVersion((version) => version + 1);
    };
    window.addEventListener("pageshow", handlePageShow);

    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (navigation?.type === "back_forward") {
      setFrameVersion((version) => version + 1);
    }

    const scriptId = "partner-iframe-resizer";
    const scriptSrc = "https://cdnjs.cloudflare.com/ajax/libs/iframe-resizer/4.3.7/iframeResizer.min.js";
    const script = document.getElementById(scriptId) as HTMLScriptElement | null;
    const resizeWhenReady = () => {
      // Script tags inserted by Next are not re-run during App Router client
      // navigation. Rebind the current iframe every time this section mounts.
      window.requestAnimationFrame(resizeFrame);
    };

    if (window.iFrameResize) {
      resizeWhenReady();
    } else if (script) {
      script.addEventListener("load", resizeWhenReady, { once: true });
    } else {
      const nextScript = document.createElement("script");
      nextScript.id = scriptId;
      nextScript.src = scriptSrc;
      nextScript.async = true;
      nextScript.addEventListener("load", resizeWhenReady, { once: true });
      document.head.appendChild(nextScript);
    }

    const frame = frameRef.current;
    return () => {
      window.removeEventListener("pageshow", handlePageShow);
      frame?.iFrameResizer?.close();
      script?.removeEventListener("load", resizeWhenReady);
    };
  }, [resizeFrame]);

  return (
    <section className={styles.section} aria-labelledby="partner-testimonials-title">
      <div className={styles.shell}>
        <div className={styles.heading}>
          <span>Patient experiences</span>
          <h2 id="partner-testimonials-title">Real stories. Thoughtful care.</h2>
          <p>Hear directly from people who have experienced the My Drip Nurse approach.</p>
        </div>
        <div className={styles.embedShell}>
          <iframe
            key={frameVersion}
            ref={frameRef}
            id={BONJORO_FRAME_ID}
            src="https://www.bonjoro.com/pe/38b7a548-411d-46d8-a89c-6f207a22a7b8"
            title="My Drip Nurse patient testimonials"
            onLoad={resizeFrame}
            frameBorder="0"
            scrolling="no"
            width="100%"
          />
        </div>
      </div>
    </section>
  );
}
