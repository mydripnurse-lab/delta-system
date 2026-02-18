"use client";

import { useEffect, useState } from "react";

export function useBrowserSearchParams() {
  const [params, setParams] = useState<URLSearchParams>(() => {
    if (typeof window === "undefined") return new URLSearchParams();
    return new URLSearchParams(window.location.search);
  });

  useEffect(() => {
    const update = () => setParams(new URLSearchParams(window.location.search));
    update();
    window.addEventListener("popstate", update);
    window.addEventListener("hashchange", update);
    return () => {
      window.removeEventListener("popstate", update);
      window.removeEventListener("hashchange", update);
    };
  }, []);

  return params;
}
