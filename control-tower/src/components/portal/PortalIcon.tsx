export type PortalIconName = "home" | "calendar" | "user" | "website" | "directory" | "services" | "affiliates" | "support" | "rewards" | "products";

export function PortalIcon({ name }: { name: PortalIconName }) {
  const props = { width: 21, height: 21, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (name === "home") return <svg {...props}><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-6h6v6" /></svg>;
  if (name === "calendar") return <svg {...props}><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01" /></svg>;
  if (name === "user") return <svg {...props}><circle cx="12" cy="8" r="3.5" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0" /></svg>;
  if (name === "website") return <svg {...props}><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.3 2.4 3.4 5.2 3.4 8.5S14.3 18.1 12 20.5C9.7 18.1 8.6 15.3 8.6 12S9.7 5.9 12 3.5Z" /></svg>;
  if (name === "directory") return <svg {...props}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15.5A2.5 2.5 0 0 0 17.5 16H4Z" /><path d="M4 5.5V19a2 2 0 0 0 2 2h11.5a2.5 2.5 0 0 0 2.5-2.5M8 7h8M8 10.5h5" /></svg>;
  if (name === "services") return <svg {...props}><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></svg>;
  if (name === "support") return <svg {...props}><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 3v-3h0A2.5 2.5 0 0 1 4 13.5Z" /><path d="M8 9h8M8 12h5" /></svg>;
  if (name === "rewards") return <svg {...props}><path d="M8 4h8v4a4 4 0 0 1-8 0Z" /><path d="M8 6H5v2a4 4 0 0 0 4 4M16 6h3v2a4 4 0 0 1-4 4M12 12v5M8 20h8M9 17h6" /></svg>;
  if (name === "products") return <svg {...props}><path d="m4 8 8-4 8 4-8 4Z" /><path d="M4 8v8l8 4 8-4V8M12 12v8" /></svg>;
  return <svg {...props}><circle cx="12" cy="6" r="2.5" /><circle cx="5.5" cy="17.5" r="2.5" /><circle cx="18.5" cy="17.5" r="2.5" /><path d="m10.2 8.1-3.1 6.1M13.8 8.1l3.1 6.1M8 17.5h8" /></svg>;
}
