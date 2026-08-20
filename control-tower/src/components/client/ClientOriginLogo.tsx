"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import { isMdnMarketingHome, trustedMdnHome } from "@/lib/trustedMdnOrigin";

const DEFAULT_HOME = "https://mydripnurse.com";
const ORIGIN_STORAGE_KEY = "mdn:marketing-origin";

type ClientOriginLogoProps = {
  className: string;
  width: number;
  height: number;
  priority?: boolean;
};

export default function ClientOriginLogo({ className, width, height, priority = false }: ClientOriginLogoProps) {
  const [home, setHome] = useState(DEFAULT_HOME);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedHome = trustedMdnHome(params.get("returnTo"));
    const previousHome = trustedMdnHome(document.referrer);
    let storedHome = "";
    try {
      storedHome = trustedMdnHome(window.sessionStorage.getItem(ORIGIN_STORAGE_KEY));
    } catch {
      // Storage can be unavailable in privacy-restricted browsers.
    }
    const marketingHome = [requestedHome, previousHome, storedHome].find((candidate) => candidate && isMdnMarketingHome(candidate));
    const resolvedHome = marketingHome || requestedHome || storedHome || previousHome || DEFAULT_HOME;

    setHome(resolvedHome);
    if (isMdnMarketingHome(resolvedHome)) {
      try {
        window.sessionStorage.setItem(ORIGIN_STORAGE_KEY, resolvedHome);
      } catch {
        // The link still works when storage is unavailable.
      }
    }
  }, []);

  return (
    <a href={home} className={className} aria-label="Return to the My Drip Nurse website">
      <Image src="/mdn-logo.png" alt="My Drip Nurse" width={width} height={height} priority={priority} />
    </a>
  );
}
