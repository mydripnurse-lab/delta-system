export type DashboardRangePreset =
  | "today"
  | "24h"
  | "1d"
  | "7d"
  | "28d"
  | "1m"
  | "3m"
  | "6m"
  | "1y"
  | "custom";

export function safeToIso(d: Date) {
  const t = d.getTime();
  if (!Number.isFinite(t)) return "";
  return d.toISOString();
}

export function isoStartOfDay(d: Date) {
  const x = new Date(d);
  if (!Number.isFinite(x.getTime())) return "";
  x.setHours(0, 0, 0, 0);
  return safeToIso(x);
}

export function isoEndOfDay(d: Date) {
  const x = new Date(d);
  if (!Number.isFinite(x.getTime())) return "";
  x.setHours(23, 59, 59, 999);
  return safeToIso(x);
}

export function computeDashboardRange(
  preset: DashboardRangePreset,
  customStart: string,
  customEnd: string,
): { start: string; end: string } {
  const now = new Date();
  const endOfToday = isoEndOfDay(now);

  const startFromDays = (days: number) => {
    const startD = new Date(now);
    startD.setDate(startD.getDate() - days);
    return { start: isoStartOfDay(startD), end: endOfToday };
  };

  if (preset === "today") {
    return { start: isoStartOfDay(now), end: endOfToday };
  }

  // `1d` is kept as legacy alias for previously stored preset values.
  if (preset === "24h" || preset === "1d") {
    const startD = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    return { start: safeToIso(startD), end: safeToIso(now) };
  }

  if (preset === "7d") return startFromDays(7);
  if (preset === "28d") return startFromDays(28);

  if (preset === "1m") {
    const startD = new Date(now);
    startD.setMonth(startD.getMonth() - 1);
    return { start: isoStartOfDay(startD), end: endOfToday };
  }

  if (preset === "3m") {
    const startD = new Date(now);
    startD.setMonth(startD.getMonth() - 3);
    return { start: isoStartOfDay(startD), end: endOfToday };
  }

  if (preset === "6m") {
    const startD = new Date(now);
    startD.setMonth(startD.getMonth() - 6);
    return { start: isoStartOfDay(startD), end: endOfToday };
  }

  if (preset === "1y") {
    // Previous calendar year (Jan 1 -> Dec 31), not trailing 12 months.
    const year = now.getFullYear() - 1;
    const start = new Date(year, 0, 1, 0, 0, 0, 0);
    const end = new Date(year, 11, 31, 23, 59, 59, 999);
    return { start: safeToIso(start), end: safeToIso(end) };
  }

  if (preset === "custom") {
    const startD = customStart ? new Date(`${customStart}T00:00:00`) : null;
    const endD = customEnd ? new Date(`${customEnd}T00:00:00`) : null;
    return {
      start: startD ? isoStartOfDay(startD) : "",
      end: endD ? isoEndOfDay(endD) : "",
    };
  }

  return { start: "", end: "" };
}
