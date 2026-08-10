"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import { PartnerExperience } from "@/components/partner/PartnerBrand";
import type { PartnerPortalProfile } from "@/lib/partnerProfiles";
import type { PartnerPortalAppointment, PartnerPortalDashboard } from "@/lib/partnerAppointments";
import type { PartnerPortalNotification } from "@/lib/partnerPortalNotifications";
import type { SupportTicket } from "@/lib/partnerSupport";

import styles from "./partnerPortal.module.css";

export type PartnerPortalScreen = "overview" | "appointments" | "availability" | "profile" | "website" | "services" | "affiliates" | "support";
type Props = { initialProfile: PartnerPortalProfile; screen?: PartnerPortalScreen };
type AvailabilityDay = { dayOfWeek: number; enabled: boolean; startTime: string; endTime: string };
type CalendarViewMode = "month" | "week" | "list";
type BlockRange = { date: string; startTime: string; endTime: string };
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type PortalIconName = "home" | "calendar" | "user" | "website" | "services" | "affiliates" | "support";
type AffiliateDashboard = {
  affiliateUrl: string;
  affiliateCode: string;
  globalRate: number;
  commissionRate: number;
  metrics: { totalEarned: number; pending: number; paid: number; appointments: number; referredPartners: number };
  referredPartners: Array<{ id: string; displayName: string; businessName: string; websiteStatus: string; joinedAt: string; appointmentCount: number; totalEarned: number; pending: number; paid: number }>;
  commissions: Array<{ id: string; appointmentId: string; reference: string; partnerName: string; serviceName: string; appointmentAt: string; amount: number; rate: number; currency: string; status: string }>;
};
type PortalCatalogService = {
  id: string;
  slug: string;
  name: string;
  description: string;
  ingredients: string[];
  price: number | null;
  partnerPriceOverride: number | null;
  effectivePrice: number | null;
  currency: string;
  depositType: string;
  depositValue: number | null;
  imageUrl: string;
  publicKey: string;
  calendarStatus: string;
  active: boolean;
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const INITIAL_AVAILABILITY: AvailabilityDay[] = DAY_NAMES.map((_, dayOfWeek) => ({
  dayOfWeek,
  enabled: false,
  startTime: "09:00",
  endTime: "17:00",
}));

const INITIAL_PARTNER_DASHBOARD: PartnerPortalDashboard = {
  completedAppointments: 0,
  upcomingAppointments: 0,
  acceptedAppointments: 0,
  declinedAppointments: 0,
  acceptanceRate: 100,
  score: 100,
  scoreLabel: "Excellent",
  completedRevenue: 0,
  currency: "USD",
};

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "MD";
}

function PortalIcon({ name }: { name: PortalIconName }) {
  const props = { width: 21, height: 21, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (name === "home") return <svg {...props}><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-6h6v6" /></svg>;
  if (name === "calendar") return <svg {...props}><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01" /></svg>;
  if (name === "user") return <svg {...props}><circle cx="12" cy="8" r="3.5" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0" /></svg>;
  if (name === "website") return <svg {...props}><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.3 2.4 3.4 5.2 3.4 8.5S14.3 18.1 12 20.5C9.7 18.1 8.6 15.3 8.6 12S9.7 5.9 12 3.5Z" /></svg>;
  if (name === "services") return <svg {...props}><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></svg>;
  if (name === "support") return <svg {...props}><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 3v-3h0A2.5 2.5 0 0 1 4 13.5Z" /><path d="M8 9h8M8 12h5" /></svg>;
  return <svg {...props}><circle cx="12" cy="6" r="2.5" /><circle cx="5.5" cy="17.5" r="2.5" /><circle cx="18.5" cy="17.5" r="2.5" /><path d="m10.2 8.1-3.1 6.1M13.8 8.1l3.1 6.1M8 17.5h8" /></svg>;
}

function appointmentDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short", timeZone: timezone,
  }).format(new Date(value));
}

function appointmentTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric", minute: "2-digit", timeZoneName: "short", timeZone: timezone,
  }).format(new Date(value));
}

function appointmentTimezoneLabel(value: string, timezone: string) {
  const zone = new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "short" })
    .formatToParts(new Date(value))
    .find((part) => part.type === "timeZoneName")?.value;
  return zone ? `Local time at appointment location · ${zone}` : `Local time at appointment location · ${timezone}`;
}

function appointmentDayKey(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: timezone,
  }).formatToParts(new Date(value));
  const year = parts.find((part) => part.type === "year")?.value || "";
  const month = parts.find((part) => part.type === "month")?.value || "";
  const day = parts.find((part) => part.type === "day")?.value || "";
  return `${year}-${month}-${day}`;
}

function appointmentClock(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: timezone,
  }).format(new Date(value));
}

function appointmentLocalParts(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: timezone,
  }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

function appointmentStartsInFuture(value: string, now = Date.now()) {
  return new Date(value).getTime() > now;
}

function appointmentCountdown(value: string, now = Date.now()) {
  const remainingMinutes = Math.max(0, Math.ceil((new Date(value).getTime() - now) / 60000));
  if (remainingMinutes <= 0) return "Ready to start";
  const hours = Math.floor(remainingMinutes / 60);
  const minutes = remainingMinutes % 60;
  if (hours > 0) return minutes > 0 ? `Starts in ${hours}h ${minutes}m` : `Starts in ${hours}h`;
  return `Starts in ${minutes}m`;
}

function formatDateOfBirth(value: string) {
  if (!value) return "Not provided";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(date);
}

function displayBlockedDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(year, month - 1, day));
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);
}

type AppointmentStatusMeta = {
  label: string;
  tone: "pending" | "confirmed" | "accepted" | "inProgress" | "completed" | "neutral";
};

function appointmentStatusMeta(status: string): AppointmentStatusMeta {
  switch (status) {
    case "payment_pending":
      return { label: "Awaiting confirmation", tone: "pending" };
    case "confirmed":
      return { label: "Awaiting your confirmation", tone: "pending" };
    case "partner_acknowledged":
      return { label: "Confirmed", tone: "confirmed" };
    case "in_progress":
      return { label: "In progress", tone: "inProgress" };
    case "completed":
      return { label: "Completed", tone: "completed" };
    default:
      return { label: status.replaceAll("_", " "), tone: "neutral" };
  }
}

function appointmentStatusClass(meta: AppointmentStatusMeta, stylesMap: Record<string, string>) {
  return stylesMap[`appointmentStatus${meta.tone[0].toUpperCase()}${meta.tone.slice(1)}`] || "";
}

function serviceDepositAmount(service: PortalCatalogService) {
  if (service.effectivePrice === null || service.depositValue === null) return null;
  return service.depositType === "fixed"
    ? Math.min(service.effectivePrice, service.depositValue)
    : service.effectivePrice * (service.depositValue / 100);
}

function servicePartnerEarnings(service: PortalCatalogService) {
  const deposit = serviceDepositAmount(service);
  return service.effectivePrice === null || deposit === null ? null : Math.max(0, service.effectivePrice - deposit);
}

function appointmentAddress(appointment: PartnerPortalAppointment) {
  return [appointment.address, appointment.city, appointment.county, appointment.state, appointment.postalCode]
    .filter(Boolean)
    .join(", ");
}

function mapUrl(provider: "google" | "apple", address: string) {
  const query = encodeURIComponent(address);
  return provider === "apple"
    ? `https://maps.apple.com/?address=${query}`
    : `https://www.google.com/maps/search/?api=1&query=${query}`;
}

export default function PartnerPortalClient({ initialProfile, screen = "overview" }: Props) {
  const [profile, setProfile] = useState(initialProfile);
  const [publicTitle, setPublicTitle] = useState(initialProfile.publicTitle);
  const [credentials, setCredentials] = useState(initialProfile.professionalCredentials);
  const [biography, setBiography] = useState(initialProfile.biography);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState(initialProfile.profilePhotoUrl);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState<PartnerPortalNotification[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsReadIds, setNotificationsReadIds] = useState<string[]>([]);
  const [notificationsError, setNotificationsError] = useState("");
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installNotice, setInstallNotice] = useState("");
  const topbarActionsRef = useRef<HTMLDivElement | null>(null);
  const mobileNavRef = useRef<HTMLElement | null>(null);
  const [availability, setAvailability] = useState<AvailabilityDay[]>(INITIAL_AVAILABILITY);
  const [timezone, setTimezone] = useState("America/New_York");
  const [blockedDates, setBlockedDates] = useState<string[]>([]);
  const [blockedRanges, setBlockedRanges] = useState<BlockRange[]>([]);
  const [blockedDate, setBlockedDate] = useState("");
  const [availabilityLoading, setAvailabilityLoading] = useState(true);
  const [availabilitySaving, setAvailabilitySaving] = useState(false);
  const [availabilityMessage, setAvailabilityMessage] = useState("");
  const [availabilityError, setAvailabilityError] = useState("");
  const [availabilityModalOpen, setAvailabilityModalOpen] = useState(false);
  const [appointments, setAppointments] = useState<PartnerPortalAppointment[]>([]);
  const [selectedAppointment, setSelectedAppointment] = useState<PartnerPortalAppointment | null>(null);
  const [selectedBlockDate, setSelectedBlockDate] = useState<string | null>(null);
  const [blockMode, setBlockMode] = useState<"full" | "partial">("full");
  const [blockStartTime, setBlockStartTime] = useState("09:00");
  const [blockEndTime, setBlockEndTime] = useState("17:00");
  const [calendarView, setCalendarView] = useState<CalendarViewMode>("month");
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => appointmentDayKey(new Date().toISOString(), "America/New_York"));
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [appointmentError, setAppointmentError] = useState("");
  const [appointmentNotice, setAppointmentNotice] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [partnerDashboard, setPartnerDashboard] = useState<PartnerPortalDashboard>(INITIAL_PARTNER_DASHBOARD);
  const [declineTarget, setDeclineTarget] = useState<PartnerPortalAppointment | null>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [declineSaving, setDeclineSaving] = useState(false);
  const [earlyStartTarget, setEarlyStartTarget] = useState<PartnerPortalAppointment | null>(null);
  const [earlyStartReason, setEarlyStartReason] = useState("");
  const [earlyStartSaving, setEarlyStartSaving] = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState<PartnerPortalAppointment | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [rescheduleSaving, setRescheduleSaving] = useState(false);
  const [affiliateDashboard, setAffiliateDashboard] = useState<AffiliateDashboard | null>(null);
  const [affiliateLoading, setAffiliateLoading] = useState(false);
  const [affiliateError, setAffiliateError] = useState("");
  const [catalogServices, setCatalogServices] = useState<PortalCatalogService[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [servicesError, setServicesError] = useState("");
  const [serviceSaving, setServiceSaving] = useState("");
  const [serviceNotice, setServiceNotice] = useState("");
  const [suggestionType, setSuggestionType] = useState("service");
  const [suggestionName, setSuggestionName] = useState("");
  const [suggestionIngredients, setSuggestionIngredients] = useState("");
  const [suggestionDetails, setSuggestionDetails] = useState("");
  const [suggestionNotice, setSuggestionNotice] = useState("");
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportError, setSupportError] = useState("");
  const [supportNotice, setSupportNotice] = useState("");
  const [supportSubject, setSupportSubject] = useState("");
  const [supportCategory, setSupportCategory] = useState("general");
  const [supportPriority, setSupportPriority] = useState("normal");
  const [supportMessage, setSupportMessage] = useState("");
  const [supportReply, setSupportReply] = useState<Record<string, string>>({});
  const [supportSubmitting, setSupportSubmitting] = useState(false);
  const websiteUrl = `https://partners.mydripnurse.com/${profile.slug}`;
  const websitePreviewUrl = `${websiteUrl}?preview=${encodeURIComponent(profile.applicationId)}`;
  const affiliateUrl = `${websiteUrl}/become-a-partner`;
  const calendarYear = calendarMonth.getFullYear();
  const calendarMonthIndex = calendarMonth.getMonth();
  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(calendarMonth);
  const firstWeekday = new Date(calendarYear, calendarMonthIndex, 1).getDay();
  const daysInMonth = new Date(calendarYear, calendarMonthIndex + 1, 0).getDate();
  const calendarCells = Array.from({ length: Math.ceil((firstWeekday + daysInMonth) / 7) * 7 }, (_, index) => {
    const day = index - firstWeekday + 1;
    const key = day > 0 && day <= daysInMonth
      ? `${calendarYear}-${String(calendarMonthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
      : null;
    return { day: day > 0 && day <= daysInMonth ? day : null, key };
  });
  const appointmentsByDay = appointments.reduce<Record<string, PartnerPortalAppointment[]>>((groups, appointment) => {
    const key = appointmentDayKey(appointment.startsAt, appointment.timezone);
    groups[key] = groups[key] ? [...groups[key], appointment] : [appointment];
    return groups;
  }, {});
  const weekStart = new Date(calendarYear, calendarMonthIndex, calendarMonth.getDate() - calendarMonth.getDay());
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + index);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return { date, key };
  });
  const listDateKeys = [...new Set([...Object.keys(appointmentsByDay), ...blockedRanges.map((range) => range.date)])].sort();
  const notificationReadStorageKey = `mdn:partner-notification-read-ids:${profile.applicationId}`;
  const unreadNotificationItems = notifications.filter((notification) => !notificationsReadIds.includes(notification.id));
  const unreadNotifications = unreadNotificationItems.length;
  const markNotificationRead = (notificationId: string) => {
    setNotificationsReadIds((current) => {
      if (current.includes(notificationId)) return current;
      const next = [...current, notificationId];
      try { window.localStorage.setItem(notificationReadStorageKey, JSON.stringify(next)); } catch { /* storage may be unavailable */ }
      return next;
    });
  };

  useEffect(() => {
    const updateViewport = () => setIsMobileViewport(window.innerWidth <= 660);
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  useEffect(() => {
    const activeItem = mobileNavRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    activeItem?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [screen]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  useEffect(() => {
    if (!notificationsOpen && !menuOpen) return;

    const closeMenusOnOutsidePress = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && topbarActionsRef.current?.contains(target)) return;
      setNotificationsOpen(false);
      setMenuOpen(false);
    };
    const closeMenusOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setNotificationsOpen(false);
      setMenuOpen(false);
    };

    document.addEventListener("pointerdown", closeMenusOnOutsidePress);
    document.addEventListener("keydown", closeMenusOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeMenusOnOutsidePress);
      document.removeEventListener("keydown", closeMenusOnEscape);
    };
  }, [menuOpen, notificationsOpen]);

  useEffect(() => {
    return () => {
      if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  useEffect(() => {
    let active = true;
    void fetch("/api/partner-portal/availability", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Unable to load availability.");
        if (!active) return;
        setAvailability(payload.availability.days);
        setTimezone(payload.availability.timezone);
        setBlockedDates(payload.availability.blockedDates || []);
        setBlockedRanges(payload.availability.blockedRanges || []);
      })
      .catch((caught) => {
        if (active) setAvailabilityError(caught instanceof Error ? caught.message : "Unable to load availability.");
      })
      .finally(() => {
        if (active) setAvailabilityLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(notificationReadStorageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) setNotificationsReadIds(parsed.filter((id): id is string => typeof id === "string"));
      }
    } catch { /* storage may be unavailable or contain invalid data */ }
    let active = true;
    const loadPortalUpdates = async () => {
      try {
        const [appointmentsResponse, notificationsResponse] = await Promise.all([
          fetch("/api/partner-portal/appointments", { cache: "no-store" }),
          fetch("/api/partner-portal/notifications", { cache: "no-store" }),
        ]);
        const appointmentsPayload = await appointmentsResponse.json();
        const notificationsPayload = await notificationsResponse.json();
        if (!active) return;
        if (appointmentsResponse.ok && appointmentsPayload?.ok) {
          setAppointments(appointmentsPayload.appointments || []);
          if (appointmentsPayload.dashboard) setPartnerDashboard(appointmentsPayload.dashboard as PartnerPortalDashboard);
        }
        if (notificationsResponse.ok && notificationsPayload?.ok) {
          const nextNotifications = (notificationsPayload.notifications || []) as PartnerPortalNotification[];
          setNotifications(nextNotifications);
          setNotificationsReadIds((current) => {
            const validIds = new Set(nextNotifications.map((notification) => notification.id));
            const next = current.filter((id) => validIds.has(id));
            if (next.length !== current.length) {
              try { window.localStorage.setItem(notificationReadStorageKey, JSON.stringify(next)); } catch { /* storage may be unavailable */ }
            }
            return next;
          });
          setNotificationsError("");
        } else if (notificationsResponse.status !== 401) {
          setNotificationsError(notificationsPayload?.error || "Unable to load notifications.");
        }
      } catch (caught) {
        if (active) setNotificationsError(caught instanceof Error ? caught.message : "Unable to load notifications.");
      }
    };
    void loadPortalUpdates();
    const timer = window.setInterval(() => { void loadPortalUpdates(); }, 20_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [notificationReadStorageKey]);

  useEffect(() => {
    if (screen !== "affiliates") return;
    let active = true;
    setAffiliateLoading(true);
    setAffiliateError("");
    void fetch("/api/partner-portal/affiliates", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Unable to load affiliate dashboard.");
        if (active) setAffiliateDashboard(payload.dashboard as AffiliateDashboard);
      })
      .catch((caught) => { if (active) setAffiliateError(caught instanceof Error ? caught.message : "Unable to load affiliate dashboard."); })
      .finally(() => { if (active) setAffiliateLoading(false); });
    return () => { active = false; };
  }, [screen]);

  useEffect(() => {
    if (screen !== "support") return;
    let active = true;
    setSupportLoading(true);
    setSupportError("");
    void fetch("/api/partner-portal/support", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Unable to load support tickets.");
        if (active) setSupportTickets(payload.tickets || []);
      })
      .catch((caught) => { if (active) setSupportError(caught instanceof Error ? caught.message : "Unable to load support tickets."); })
      .finally(() => { if (active) setSupportLoading(false); });
    return () => { active = false; };
  }, [screen]);

  async function submitSupport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSupportSubmitting(true);
    setSupportError("");
    setSupportNotice("");
    try {
      const response = await fetch("/api/partner-portal/support", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject: supportSubject, category: supportCategory, priority: supportPriority, message: supportMessage }) });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Unable to create support ticket.");
      setSupportTickets(payload.tickets || []);
      setSupportSubject("");
      setSupportMessage("");
      setSupportNotice("Your ticket is open. Our Partner Support team will reply here.");
    } catch (caught) {
      setSupportError(caught instanceof Error ? caught.message : "Unable to create support ticket.");
    } finally { setSupportSubmitting(false); }
  }

  async function sendSupportReply(ticketId: string) {
    const message = String(supportReply[ticketId] || "").trim();
    if (!message) return;
    setSupportSubmitting(true);
    setSupportError("");
    try {
      const response = await fetch("/api/partner-portal/support", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticketId, message }) });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Unable to send reply.");
      setSupportTickets(payload.tickets || []);
      setSupportReply((current) => ({ ...current, [ticketId]: "" }));
    } catch (caught) {
      setSupportError(caught instanceof Error ? caught.message : "Unable to send reply.");
    } finally { setSupportSubmitting(false); }
  }

  useEffect(() => {
    if (screen !== "services") return;
    let active = true;
    setServicesLoading(true);
    setServicesError("");
    void fetch("/api/partner-portal/services", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Unable to load the service catalog.");
        if (active) setCatalogServices(payload.services || []);
      })
      .catch((caught) => { if (active) setServicesError(caught instanceof Error ? caught.message : "Unable to load the service catalog."); })
      .finally(() => { if (active) setServicesLoading(false); });
    return () => { active = false; };
  }, [screen]);

  function selectPhoto(file: File | null) {
    setPhoto(file);
    if (file) setPreview(URL.createObjectURL(file));
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    const body = new FormData();
    body.append("publicTitle", publicTitle);
    body.append("professionalCredentials", credentials);
    body.append("biography", biography);
    if (photo) body.append("profilePhoto", photo);
    try {
      const response = await fetch("/api/partner-portal/profile", { method: "PATCH", body });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Unable to save your profile.");
      setProfile(payload.profile as PartnerPortalProfile);
      setPhoto(null);
      setMessage("Your website profile and photo were saved successfully.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save your profile.");
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    await fetch("/api/public/partner-portal/logout", { method: "POST" });
    window.location.href = "/partner-login";
  }

  async function installApp() {
    setInstallNotice("");
    if (!installPrompt) {
      setInstallNotice("On iPhone or iPad, open your browser menu and choose Add to Home Screen.");
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstallPrompt(null);
  }

  async function toggleCatalogService(service: PortalCatalogService) {
    setServiceSaving(service.slug);
    setServicesError("");
    try {
      const response = await fetch("/api/partner-portal/services", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceKey: service.slug, active: !service.active }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Unable to update this service.");
      setCatalogServices(payload.services || []);
      setServiceNotice(`${service.name} is now ${!service.active ? "available" : "paused"}. Your website and booking availability were updated.`);
    } catch (caught) {
      setServicesError(caught instanceof Error ? caught.message : "Unable to update this service.");
    } finally {
      setServiceSaving("");
    }
  }

  async function submitServiceSuggestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuggestionNotice("");
    setServicesError("");
    try {
      const ingredients = suggestionIngredients.split(/[\n,]/).map((value) => value.trim()).filter(Boolean);
      const response = await fetch("/api/partner-portal/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: suggestionType, name: suggestionName, ingredients, details: suggestionDetails }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Unable to send your suggestion.");
      setSuggestionName("");
      setSuggestionIngredients("");
      setSuggestionDetails("");
      setSuggestionNotice("Thank you. Your suggestion was sent to the My Drip Nurse team.");
    } catch (caught) {
      setServicesError(caught instanceof Error ? caught.message : "Unable to send your suggestion.");
    }
  }

  function updateAvailabilityDay(dayOfWeek: number, patch: Partial<AvailabilityDay>) {
    setAvailability((current) => current.map((day) => day.dayOfWeek === dayOfWeek ? { ...day, ...patch } : day));
  }

  function addBlockedDate() {
    if (!blockedDate || blockedDates.includes(blockedDate)) return;
    setBlockedDates((current) => [...current, blockedDate].sort());
    setBlockedDate("");
  }

  function removeBlockedDate(date: string) {
    setBlockedDates((current) => current.filter((item) => item !== date));
  }

  function openBlockDialog(date: string) {
    const dayAppointments = appointmentsByDay[date] || [];
    const latestEnd = [...dayAppointments].sort((a, b) => new Date(b.endsAt).getTime() - new Date(a.endsAt).getTime())[0];
    setBlockMode(dayAppointments.length ? "partial" : "full");
    setBlockStartTime(latestEnd ? appointmentClock(latestEnd.endsAt, latestEnd.timezone) : "09:00");
    setBlockEndTime("24:00");
    setSelectedBlockDate(date);
  }

  function selectCalendarDate(date: string) {
    setSelectedCalendarDate(date);
    if (!isMobileViewport) openBlockDialog(date);
  }

  function shiftCalendarPeriod(direction: number) {
    if (calendarView === "week") {
      setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth(), current.getDate() + (direction * 7)));
      return;
    }
    setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + direction, 1));
  }

  async function saveAvailability(nextBlockedDates = blockedDates, nextBlockedRanges = blockedRanges): Promise<boolean> {
    setAvailabilitySaving(true);
    setAvailabilityMessage("");
    setAvailabilityError("");
    try {
      const response = await fetch("/api/partner-portal/availability", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone, days: availability, blockedDates: nextBlockedDates, blockedRanges: nextBlockedRanges }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Unable to save availability.");
      setAvailability(payload.availability.days);
      setBlockedDates(payload.availability.blockedDates || nextBlockedDates);
      setBlockedRanges(payload.availability.blockedRanges || nextBlockedRanges);
      setAvailabilityMessage("Your booking availability is active and up to date.");
      return true;
    } catch (caught) {
      setAvailabilityError(caught instanceof Error ? caught.message : "Unable to save availability.");
      return false;
    } finally {
      setAvailabilitySaving(false);
    }
  }

  async function saveCalendarBlock() {
    if (!selectedBlockDate) return;
    const hasFullDay = blockedDates.includes(selectedBlockDate);
    const existingRanges = blockedRanges.filter((range) => range.date !== selectedBlockDate);
    const nextBlockedDates = hasFullDay
      ? blockedDates.filter((date) => date !== selectedBlockDate)
      : blockMode === "full" ? [...blockedDates, selectedBlockDate].sort() : blockedDates;
    const nextBlockedRanges = hasFullDay
      ? existingRanges
      : blockMode === "partial"
        ? [...existingRanges, { date: selectedBlockDate, startTime: blockStartTime, endTime: blockEndTime }]
        : existingRanges;
    const saved = await saveAvailability(nextBlockedDates, nextBlockedRanges);
    if (saved) setSelectedBlockDate(null);
  }

  async function advanceAppointment(appointmentId: string, action: "acknowledge" | "start" | "complete", options?: { earlyStartReason?: string }) {
    setAppointmentError("");
    setAppointmentNotice("");
    try {
      const response = await fetch("/api/partner-portal/appointments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId, action, earlyStartReason: options?.earlyStartReason || undefined }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Unable to update the appointment.");
      setAppointments(payload.appointments || []);
      if (payload.dashboard) setPartnerDashboard(payload.dashboard as PartnerPortalDashboard);
      if (action === "acknowledge") setAppointmentNotice("Appointment accepted. The patient will keep receiving the normal booking updates.");
      if (action === "start") setAppointmentNotice(options?.earlyStartReason ? "Early visit start recorded with your reason." : "Visit started.");
      return true;
    } catch (caught) {
      setAppointmentError(caught instanceof Error ? caught.message : "Unable to update the appointment.");
      return false;
    }
  }

  async function startAppointmentEarly() {
    if (!earlyStartTarget || earlyStartReason.trim().length < 3) return;
    setEarlyStartSaving(true);
    const started = await advanceAppointment(earlyStartTarget.id, "start", { earlyStartReason: earlyStartReason.trim() });
    if (started) {
      setEarlyStartTarget(null);
      setEarlyStartReason("");
    }
    setEarlyStartSaving(false);
  }

  async function declineAppointment() {
    if (!declineTarget) return;
    setDeclineSaving(true);
    setAppointmentError("");
    setAppointmentNotice("");
    try {
      const response = await fetch("/api/partner-portal/appointments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId: declineTarget.id, action: "decline", reason: declineReason }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Unable to decline this appointment.");
      setAppointments(payload.appointments || []);
      setAppointmentNotice(payload.message || "The appointment decision was saved.");
      if (payload.dashboard) setPartnerDashboard(payload.dashboard as PartnerPortalDashboard);
      setDeclineTarget(null);
      setDeclineReason("");
    } catch (caught) {
      setAppointmentError(caught instanceof Error ? caught.message : "Unable to decline this appointment.");
    } finally {
      setDeclineSaving(false);
    }
  }

  function openReschedule(appointment: PartnerPortalAppointment) {
    const parts = appointmentLocalParts(appointment.startsAt, appointment.timezone);
    setRescheduleTarget(appointment);
    setRescheduleDate(parts.date);
    setRescheduleTime(parts.time);
    setRescheduleReason("");
    setSelectedAppointment(null);
  }

  async function rescheduleAppointment() {
    if (!rescheduleTarget || !rescheduleDate || !rescheduleTime) return;
    setRescheduleSaving(true);
    setAppointmentError("");
    setAppointmentNotice("");
    try {
      const response = await fetch("/api/partner-portal/appointments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointmentId: rescheduleTarget.id,
          action: "reschedule",
          newDate: rescheduleDate,
          newTime: rescheduleTime,
          timezone: rescheduleTarget.timezone,
          reason: rescheduleReason.trim() || undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Unable to reschedule this appointment.");
      setAppointments(payload.appointments || []);
      if (payload.dashboard) setPartnerDashboard(payload.dashboard as PartnerPortalDashboard);
      setRescheduleTarget(null);
      setAppointmentNotice("Appointment rescheduled. The client notification webhook was sent.");
    } catch (caught) {
      setAppointmentError(caught instanceof Error ? caught.message : "Unable to reschedule this appointment.");
    } finally {
      setRescheduleSaving(false);
    }
  }

  const blockedDaysEditor = (
    <div className={styles.blockedDaysCard} id="blocked-days">
      <div>
        <span>Calendar controls</span>
        <h3>Block a day</h3>
        <p>Choose a date and block the full day or only a time window. Existing appointments stay protected.</p>
      </div>
      <div className={styles.blockedDaysAdd}>
        <label>Date<input type="date" value={blockedDate} onChange={(event) => setBlockedDate(event.target.value)} /></label>
        <button type="button" onClick={addBlockedDate} disabled={!blockedDate}>Add blocked day</button>
      </div>
      {blockedDates.length || blockedRanges.length ? <div className={styles.blockedDaysList} aria-label="Blocked days and hours">
        {blockedDates.map((date) => <span key={`full-${date}`}>{displayBlockedDate(date)} · Full day<button type="button" onClick={() => removeBlockedDate(date)} aria-label={`Remove blocked day ${displayBlockedDate(date)}`}>×</button></span>)}
        {blockedRanges.filter((range) => !blockedDates.includes(range.date)).map((range) => <span key={`${range.date}-${range.startTime}-${range.endTime}`}>{displayBlockedDate(range.date)} · {range.startTime}–{range.endTime}<button type="button" onClick={() => setBlockedRanges((current) => current.filter((item) => item !== range))} aria-label={`Remove blocked hours for ${displayBlockedDate(range.date)}`}>×</button></span>)}
      </div> : <small className={styles.noBlockedDays}>No blocked days or hours scheduled.</small>}
      <div className={styles.blockedDaysSave}><button type="button" onClick={() => void saveAvailability()} disabled={availabilitySaving}>{availabilitySaving ? "Saving…" : "Save blocked days"}</button></div>
    </div>
  );

  const availabilityEditor = (
    <>
      {availabilityLoading ? <p className={styles.schedulePlaceholder}>Loading your schedule…</p> : (
        <div className={styles.scheduleEditor}>
          <label className={styles.timezoneField}>Time zone
            <select value={timezone} onChange={(event) => setTimezone(event.target.value)}>
              <option value="America/New_York">Eastern Time</option>
              <option value="America/Chicago">Central Time</option>
              <option value="America/Denver">Mountain Time</option>
              <option value="America/Phoenix">Arizona Time</option>
              <option value="America/Los_Angeles">Pacific Time</option>
              <option value="America/Puerto_Rico">Puerto Rico / Atlantic</option>
            </select>
          </label>
          <div className={styles.scheduleList}>
            {availability.map((day) => (
              <div className={day.enabled ? styles.scheduleDayActive : styles.scheduleDay} key={day.dayOfWeek}>
                <label className={styles.dayToggle}><input type="checkbox" checked={day.enabled} onChange={(event) => updateAvailabilityDay(day.dayOfWeek, { enabled: event.target.checked })} /><span>{DAY_NAMES[day.dayOfWeek]}</span></label>
                {day.enabled ? <div className={styles.timeRange}><label>From<input type="time" value={day.startTime} onChange={(event) => updateAvailabilityDay(day.dayOfWeek, { startTime: event.target.value })} /></label><span>to</span><label>Until<input type="time" value={day.endTime} onChange={(event) => updateAvailabilityDay(day.dayOfWeek, { endTime: event.target.value })} /></label></div> : <small>Unavailable</small>}
              </div>
            ))}
          </div>
          {blockedDaysEditor}
          {availabilityMessage ? <p className={styles.success}>{availabilityMessage}</p> : null}
          {availabilityError ? <p className={styles.error}>{availabilityError}</p> : null}
          <div className={styles.formActions}><button type="button" onClick={() => void saveAvailability()} disabled={availabilitySaving}>{availabilitySaving ? "Saving…" : "Save availability"}</button></div>
        </div>
      )}
    </>
  );

  return (
    <PartnerExperience className={styles.experience}>
      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <Link href="/partner-portal" className={styles.brand}>
            <span className={styles.brandMark}>MDN</span>
            <span><strong>Partner Portal</strong><small>My Drip Nurse</small></span>
          </Link>
          <nav className={styles.navigation} aria-label="Partner Portal">
            <Link href="/partner-portal" className={screen === "overview" ? styles.active : ""}><span className={styles.navIcon}><PortalIcon name="home" /></span> Overview</Link>
            <Link href="/partner-portal/appointments" className={screen === "appointments" ? styles.active : ""}><span className={styles.navIcon}><PortalIcon name="calendar" /></span> Appointments</Link>
            <Link href="/partner-portal/profile" className={screen === "profile" ? styles.active : ""}><span className={styles.navIcon}><PortalIcon name="user" /></span> Public profile</Link>
            <Link href="/partner-portal/website" className={screen === "website" ? styles.active : ""}><span className={styles.navIcon}><PortalIcon name="website" /></span> My website</Link>
            <Link href="/partner-portal/services" className={screen === "services" ? styles.active : ""}><span className={styles.navIcon}><PortalIcon name="services" /></span> Services</Link>
            <Link href="/partner-portal/affiliates" className={screen === "affiliates" ? styles.active : ""}><span className={styles.navIcon}><PortalIcon name="affiliates" /></span> Affiliates</Link>
            <Link href="/partner-portal/support" className={`${styles.mobileSupportLink} ${screen === "support" ? styles.active : ""}`}><span className={styles.navIcon}><PortalIcon name="support" /></span> Support</Link>
          </nav>
          <div className={styles.sidebarHelp}>
            <strong>Need help?</strong>
            <p>Our Partner team is here for you.</p>
            <Link href="/partner-portal/support">Contact support <span aria-hidden="true">→</span></Link>
          </div>
        </aside>

        <main className={styles.main}>
          <header className={styles.topbar}>
            <Link href="/partner-portal" className={styles.mobileTopbarBrand} aria-label="My Drip Nurse Partner Portal">
              <span className={styles.brandMark}>MDN</span>
              <span><strong>Partner Portal</strong><small>My Drip Nurse</small></span>
            </Link>
            <div><small>Partner workspace</small><strong>{profile.businessName || profile.displayName}</strong></div>
            <div className={styles.topbarActions} ref={topbarActionsRef}>
              <div className={styles.notificationWrap}>
                <button
                  type="button"
                  className={styles.notificationButton}
                  aria-label={unreadNotifications ? `${unreadNotifications} unread notifications` : "Notifications"}
                  aria-expanded={notificationsOpen}
                  onClick={() => {
                    setNotificationsOpen((open) => !open);
                    setMenuOpen(false);
                  }}
                >
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" />
                  </svg>
                  <span className={styles.notificationLabel}>Notifications</span>
                  {unreadNotifications ? <span className={styles.notificationBadge}>{unreadNotifications > 9 ? "9+" : unreadNotifications}</span> : null}
                </button>
                {notificationsOpen ? (
                  <div className={styles.notificationMenu} role="dialog" aria-label="Notifications">
                    <div className={styles.notificationMenuHeader}><strong>Notifications</strong><span>{unreadNotifications ? `${unreadNotifications} new` : "Up to date"}</span></div>
                    {notificationsError ? <p className={styles.notificationError}>{notificationsError}</p> : null}
                    {!notificationsError && !unreadNotificationItems.length ? <p className={styles.notificationEmpty}>No new notifications.</p> : null}
                    {unreadNotificationItems.slice(0, 6).map((notification) => (
                      <button
                        type="button"
                        className={`${styles.notificationItem} ${styles.notificationItemUnread}`}
                        key={notification.id}
                        onClick={() => markNotificationRead(notification.id)}
                        aria-label={`Open notification: ${notification.title}`}
                      >
                        <strong>{notification.title}</strong>
                        <p>{notification.message}</p>
                        <small>{new Date(notification.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</small>
                      </button>
                    ))}
                    <Link className={styles.notificationMenuLink} href="/partner-portal/appointments" onClick={() => setNotificationsOpen(false)}>View appointments <span aria-hidden="true">→</span></Link>
                  </div>
                ) : null}
              </div>
              <div className={styles.accountWrap}>
                <button
                  type="button"
                  className={styles.account}
                  onClick={() => {
                    setMenuOpen((open) => !open);
                    setNotificationsOpen(false);
                  }}
                  aria-expanded={menuOpen}
                >
                  {profile.profilePhotoUrl ? <img src={profile.profilePhotoUrl} alt={`${profile.displayName} Partner profile`} title={`${profile.displayName} My Drip Nurse Partner profile`} /> : <span>{initials(profile.displayName)}</span>}
                  <div><strong>{profile.displayName}</strong><small>{profile.email}</small></div>
                  <b>⌄</b>
                </button>
                {menuOpen ? (
                  <div className={styles.accountMenu}>
                    <Link href="/partner-portal/profile" onClick={() => setMenuOpen(false)}>Edit profile</Link>
                    <button type="button" onClick={() => { setMenuOpen(false); void installApp(); }}>Install Partner Portal</button>
                    <button type="button" onClick={() => { setMenuOpen(false); void signOut(); }}>Sign out</button>
                    {installNotice ? <small className={styles.installNotice}>{installNotice}</small> : null}
                  </div>
                ) : null}
              </div>
            </div>
          </header>

          <div className={styles.content}>
            {screen === "overview" ? <>
            <section className={styles.welcome} id="overview">
              <div><span>Welcome back</span><h1>{profile.displayName}</h1><p>Manage the information patients see and keep your My Drip Nurse presence current.</p></div>
              <span className={`${styles.status} ${styles[profile.websiteStatus]}`}>{profile.websiteStatus}</span>
            </section>

            <div className={styles.partnerDashboardGrid} aria-label="Partner performance dashboard">
              <article className={`${styles.partnerDashboardMetric} ${styles.partnerScoreMetric}`}><span>Partner score</span><strong>{partnerDashboard.score}<small>/ 100</small></strong><em>{partnerDashboard.scoreLabel}</em><small>Starts at 100 · −10 per declined appointment</small></article>
              <article className={`${styles.partnerDashboardMetric} ${styles.partnerRevenueMetric}`}><span>Revenue generated for you</span><strong>{money(partnerDashboard.completedRevenue, partnerDashboard.currency)}</strong><small>Completed visits · amount to collect at the appointment</small></article>
              <article className={styles.partnerDashboardMetric}><span>Completed appointments</span><strong>{partnerDashboard.completedAppointments}</strong><small>Visits successfully completed</small></article>
              <article className={styles.partnerDashboardMetric}><span>Upcoming appointments</span><strong>{partnerDashboard.upcomingAppointments}</strong><small>Visits on your calendar</small></article>
              <article className={styles.partnerDashboardMetric}><span>Acceptance rate</span><strong>{partnerDashboard.acceptanceRate}%</strong><small>{partnerDashboard.acceptedAppointments} accepted · {partnerDashboard.declinedAppointments} declined</small></article>
            </div>
            <div className={styles.partnerPerformanceNote}><strong>How your score works</strong><span>Accept appointments you can fulfill and complete each visit. If you cannot attend, decline promptly with a reason so we can reroute the patient. When no coverage exists, the client deposit is refunded automatically.</span></div>

            <div className={styles.summaryGrid}>
              <article><span>Service areas</span><strong>{profile.serviceAreas.length}</strong><small>{profile.serviceAreas.map((area) => area.county).join(", ") || "Pending"}</small></article>
              <article><span>Active services</span><strong>{profile.services.length}</strong><small>Connected through your calendar group</small></article>
              <article><span>Available days</span><strong>{availability.filter((day) => day.enabled).length}</strong><small>Minimum notice: 2 hours</small></article>
              <article><span>Website profile</span><strong>{profile.profilePhotoUrl ? "Ready" : "Review"}</strong><small>Public photo and biography</small></article>
            </div>
            </> : null}

            {screen === "appointments" ? <section className={styles.panel} id="appointments">
              <div className={styles.panelHeading}><div><span>Appointments</span><h2>All patient visits</h2></div><div className={styles.panelHeadingActions}><strong>{appointments.length} total visits</strong><button type="button" className={styles.calendarSettingsButton} onClick={() => setAvailabilityModalOpen(true)} aria-label="Open availability settings" title="Availability settings">⚙</button></div></div>
              <div className={styles.calendarToolbar}>
                <button type="button" onClick={() => shiftCalendarPeriod(-1)} aria-label="Previous period">‹</button>
                <strong>{calendarView === "week" ? `${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(weekDays[0].date)} – ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(weekDays[6].date)}` : calendarView === "list" ? "All visits" : monthLabel}</strong>
                <button type="button" onClick={() => shiftCalendarPeriod(1)} aria-label="Next period">›</button>
                <div className={styles.calendarViewSwitcher} role="group" aria-label="Calendar view">
                  {(["month", "week", "list"] as CalendarViewMode[]).map((view) => <button type="button" key={view} className={calendarView === view ? styles.calendarViewActive : ""} onClick={() => setCalendarView(view)}>{view === "month" ? "Monthly" : view === "week" ? "Weekly" : "List"}</button>)}
                </div>
              </div>
              {calendarView === "month" ? <>
              <div className={styles.calendarWeekdays} aria-hidden="true">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}</div>
              <div className={styles.calendarGrid} role="grid" aria-label={`${monthLabel} appointments`}>
                {calendarCells.map((cell, index) => {
                  const dayAppointments = cell.key ? appointmentsByDay[cell.key] || [] : [];
                    const isBlocked = Boolean(cell.key && blockedDates.includes(cell.key));
                    const isPartiallyBlocked = Boolean(cell.key && blockedRanges.some((range) => range.date === cell.key));
                  const isSelected = Boolean(cell.key && selectedCalendarDate === cell.key);
                  const cellClassName = cell.day
                    ? `${styles.calendarCell} ${styles.calendarCellInteractive} ${isBlocked ? styles.calendarCellBlocked : ""} ${isSelected ? styles.calendarCellSelected : ""}`
                    : styles.calendarCellMuted;
                  return <div
                    className={cellClassName}
                    role="gridcell"
                    tabIndex={cell.key ? 0 : -1}
                    key={`${cell.key || "empty"}-${index}`}
                    aria-label={cell.key ? `${displayBlockedDate(cell.key)}${isBlocked ? ", blocked" : ", available to block"}` : undefined}
                    onClick={() => cell.key && selectCalendarDate(cell.key)}
                    onKeyDown={(event) => {
                      if (cell.key && (event.key === "Enter" || event.key === " ")) {
                        event.preventDefault();
                        selectCalendarDate(cell.key);
                      }
                    }}
                  >
                    {cell.day ? <span className={styles.calendarDayNumber}>{cell.day}</span> : null}
                    {isBlocked ? <span className={styles.calendarBlockBadge}>Blocked</span> : isPartiallyBlocked ? <span className={styles.calendarBlockBadge}>Hours blocked</span> : null}
                    {dayAppointments.length ? <span className={styles.calendarAppointmentDot} aria-label={`${dayAppointments.length} appointment${dayAppointments.length === 1 ? "" : "s"}`} /> : null}
                    <div className={styles.calendarEvents}>
                      {dayAppointments.slice(0, 3).map((appointment) => { const meta = appointmentStatusMeta(appointment.status); return <button type="button" className={`${styles.calendarEvent} ${appointmentStatusClass(meta, styles)}`} key={appointment.id} onClick={(event) => { event.stopPropagation(); setSelectedAppointment(appointment); }} title={`${appointment.customerName} · ${appointment.serviceName}`}>
                        <strong>{appointmentTime(appointment.startsAt, appointment.timezone)}</strong><span>{appointment.customerName}</span>
                      </button>; })}
                      {dayAppointments.length > 3 ? <button type="button" className={styles.calendarMoreButton} onClick={(event) => { event.stopPropagation(); selectCalendarDate(cell.key as string); }}>+{dayAppointments.length - 3} more</button> : null}
                    </div>
                  </div>;
                })}
              </div>
              </> : null}
              {calendarView === "week" ? <div className={styles.weekCalendar} role="grid" aria-label="Weekly appointments">
                <div className={styles.weekCalendarHeader}><span className={styles.weekTimeGutter}>Time</span>{weekDays.map(({ date, key }) => <button type="button" className={selectedCalendarDate === key ? styles.weekDayActive : ""} key={key} onClick={() => selectCalendarDate(key)}><small>{new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date)}</small><strong>{date.getDate()}</strong></button>)}</div>
                <div className={styles.weekCalendarBody}><div className={styles.weekTimeGutter}>{["8 AM", "10 AM", "12 PM", "2 PM", "4 PM", "6 PM"].map((time) => <span key={time}>{time}</span>)}</div>{weekDays.map(({ key }) => <div className={`${styles.weekDayColumn} ${blockedDates.includes(key) ? styles.weekDayBlocked : ""}`} key={key} onClick={() => selectCalendarDate(key)}>{blockedDates.includes(key) ? <span className={styles.weekBlockedLabel}>Blocked</span> : null}{(appointmentsByDay[key] || []).map((appointment) => { const meta = appointmentStatusMeta(appointment.status); return <button type="button" className={`${styles.weekEvent} ${appointmentStatusClass(meta, styles)}`} key={appointment.id} onClick={(event) => { event.stopPropagation(); setSelectedAppointment(appointment); }}><strong>{appointmentTime(appointment.startsAt, appointment.timezone)}</strong><span>{appointment.customerName}</span><small>{appointment.serviceName}</small></button>; })}</div>)}</div>
              </div> : null}
              {calendarView === "list" ? <div className={styles.listCalendar} aria-label="All appointments list">
                {listDateKeys.length ? listDateKeys.map((date) => <section className={styles.listDayGroup} key={date}><div className={styles.listDayHeading}><button type="button" onClick={() => selectCalendarDate(date)}>{displayBlockedDate(date)}</button><span>{blockedDates.includes(date) ? "Full day blocked" : `${(appointmentsByDay[date] || []).length} visit${(appointmentsByDay[date] || []).length === 1 ? "" : "s"}`}</span></div>{(appointmentsByDay[date] || []).length ? (appointmentsByDay[date] || []).map((appointment) => { const meta = appointmentStatusMeta(appointment.status); return <button type="button" className={`${styles.listEvent} ${appointmentStatusClass(meta, styles)}`} key={appointment.id} onClick={() => setSelectedAppointment(appointment)}><span className={styles.listEventAccent} /><span><strong>{appointment.serviceName}</strong><small>{appointment.customerName} · {appointment.city}, {appointment.state}</small></span><time>{appointmentTime(appointment.startsAt, appointment.timezone)}<small>{meta.label}</small></time></button>; }) : <p className={styles.listEmpty}>{blockedDates.includes(date) ? "No new bookings will be accepted." : "Nothing planned for this day."}</p>}</section>) : <div className={styles.listNoResults}><strong>No appointments in this period.</strong><span>New and completed visits will appear here.</span></div>}
              </div> : null}
              {calendarView === "month" && selectedCalendarDate ? (
                <div className={styles.mobileDayDetails} aria-live="polite">
                  <div className={styles.mobileDayDetailsHeader}>
                    <span>{displayBlockedDate(selectedCalendarDate)}</span>
                    <button type="button" onClick={() => openBlockDialog(selectedCalendarDate)}>{blockedDates.includes(selectedCalendarDate) ? "Unblock day" : "Block day"}</button>
                  </div>
                  {(appointmentsByDay[selectedCalendarDate] || []).length ? (
                    <div className={styles.mobileDayAppointmentList}>
                      {(appointmentsByDay[selectedCalendarDate] || []).map((appointment) => { const meta = appointmentStatusMeta(appointment.status); return <button type="button" className={`${styles.mobileDayAppointment} ${appointmentStatusClass(meta, styles)}`} key={appointment.id} onClick={() => setSelectedAppointment(appointment)}>
                        <span className={styles.mobileDayAppointmentAccent} />
                        <span><strong>{appointment.customerName}</strong><small>{appointment.serviceName}</small></span>
                        <span className={styles.mobileDayAppointmentTime}>{appointmentTime(appointment.startsAt, appointment.timezone)}<small>{meta.label}</small></span>
                      </button>; })}
                    </div>
                  ) : <div className={styles.mobileDayEmpty}><span>i</span><p>Nothing planned for this day.</p></div>}
                </div>
              ) : null}
              {selectedBlockDate ? (
                <div className={styles.detailBackdrop} role="presentation" onClick={() => setSelectedBlockDate(null)}>
                  <section className={styles.detailSheet} role="dialog" aria-modal="true" aria-labelledby="block-day-title" onClick={(event) => event.stopPropagation()}>
                    <div className={styles.detailHeader}>
                      <div><span>Calendar controls</span><h2 id="block-day-title">{displayBlockedDate(selectedBlockDate)}</h2></div>
                      <button type="button" className={styles.closeDetail} onClick={() => setSelectedBlockDate(null)} aria-label="Close block day dialog">×</button>
                    </div>
                    <p className={styles.blockDialogCopy}>{blockedDates.includes(selectedBlockDate)
                      ? "This day is currently blocked and will not show new booking times."
                      : "Choose a full-day block or close only the remaining hours for this date."}</p>
                    {(appointmentsByDay[selectedBlockDate] || []).length ? <p className={styles.blockDialogWarning}>Existing appointments remain unchanged. The suggested window starts after the last visit, so the remaining hours are protected without affecting confirmed appointments.</p> : null}
                    {!blockedDates.includes(selectedBlockDate) ? <div className={styles.blockModeGroup} role="radiogroup" aria-label="Block duration">
                      <label className={blockMode === "full" ? styles.blockModeOptionActive : styles.blockModeOption}><input type="radio" name="block-mode" value="full" checked={blockMode === "full"} onChange={() => setBlockMode("full")} /><span><strong>Full day</strong><small>No new bookings for the entire date.</small></span></label>
                      <label className={blockMode === "partial" ? styles.blockModeOptionActive : styles.blockModeOption}><input type="radio" name="block-mode" value="partial" checked={blockMode === "partial"} onChange={() => setBlockMode("partial")} /><span><strong>Block hours</strong><small>Keep the rest of the day available.</small></span></label>
                    </div> : null}
                    {!blockedDates.includes(selectedBlockDate) && blockMode === "partial" ? <div className={styles.blockTimeFields}>
                      <label>From<input type="time" value={blockStartTime} onChange={(event) => setBlockStartTime(event.target.value)} /></label>
                      <span>to</span>
                      <label>Until<select value={blockEndTime} onChange={(event) => setBlockEndTime(event.target.value)}><option value="24:00">End of day</option>{["12:00", "14:00", "16:00", "18:00", "20:00", "22:00"].map((time) => <option value={time} key={time}>{time}</option>)}</select></label>
                    </div> : null}
                    <div className={styles.blockDialogActions}>
                      <button type="button" className={styles.blockDialogCancel} onClick={() => setSelectedBlockDate(null)}>Cancel</button>
                      <button type="button" className={styles.blockDialogConfirm} onClick={() => void saveCalendarBlock()} disabled={availabilitySaving}>{availabilitySaving ? "Saving…" : blockedDates.includes(selectedBlockDate) ? "Unblock this day" : "Block this day"}</button>
                    </div>
                  </section>
                </div>
              ) : null}
              {appointmentNotice ? <p className={styles.success}>{appointmentNotice}</p> : null}
              {appointments.length ? <div className={styles.appointmentList}>{appointments.map((appointment) => { const meta = appointmentStatusMeta(appointment.status); return (
                <article key={appointment.id} className={`${styles.appointmentCard} ${appointmentStatusClass(meta, styles)}`}>
                  <button type="button" className={styles.appointmentSummary} onClick={() => setSelectedAppointment(appointment)} aria-label={`View details for ${appointment.customerName}`}>
                    <div className={styles.appointmentTime}><strong>{appointmentDate(appointment.startsAt, appointment.timezone)}</strong><small>{appointment.serviceName}</small></div>
                    <div className={styles.appointmentPatient}><strong>{appointment.customerName}</strong><small>{appointment.city}, {appointment.state} · {appointment.customerPhone}</small></div>
                    <span className={styles.appointmentOpen}>View details <b>→</b></span>
                  </button>
                  <div className={styles.appointmentActions}>
                    <span className={styles.appointmentStatusPill}>{meta.label}</span>
                    {appointmentAddress(appointment) ? <><a className={styles.mapAction} href={mapUrl("google", appointmentAddress(appointment))} target="_blank" rel="noopener noreferrer">Google Maps</a><a className={styles.mapAction} href={mapUrl("apple", appointmentAddress(appointment))} target="_blank" rel="noopener noreferrer">Apple Maps</a></> : null}
                  </div>
                </article>
              ); })}</div> : <p className={styles.emptyAppointments}>New and completed appointments will appear here with the patient, service and address details you need.</p>}
              {appointmentError ? <p className={styles.error}>{appointmentError}</p> : null}
            </section> : null}

            {screen === "appointments" && availabilityModalOpen ? (
              <div className={styles.detailBackdrop} role="presentation" onClick={() => setAvailabilityModalOpen(false)}>
                <section className={`${styles.detailSheet} ${styles.availabilityModalSheet}`} role="dialog" aria-modal="true" aria-labelledby="availability-settings-title" onClick={(event) => event.stopPropagation()}>
                  <div className={styles.detailHeader}>
                    <div><span>Calendar settings</span><h2 id="availability-settings-title">Availability</h2></div>
                    <button type="button" className={styles.closeDetail} onClick={() => setAvailabilityModalOpen(false)} aria-label="Close availability settings">×</button>
                  </div>
                  <p className={styles.blockDialogCopy}>Edit the weekly hours and blocked days that patients can book.</p>
                  {availabilityEditor}
                </section>
              </div>
            ) : null}

            {screen === "appointments" && selectedAppointment ? (
              <div className={styles.detailBackdrop} role="presentation" onClick={() => setSelectedAppointment(null)}>
                <section className={styles.detailSheet} role="dialog" aria-modal="true" aria-labelledby="appointment-detail-title" onClick={(event) => event.stopPropagation()}>
                  <div className={styles.detailHeader}>
                    <div><span>Appointment details</span><h2 id="appointment-detail-title">{selectedAppointment.serviceName}</h2></div>
                    <button type="button" className={styles.closeDetail} onClick={() => setSelectedAppointment(null)} aria-label="Close appointment details">×</button>
                  </div>
                  <div className={styles.detailGrid}>
                    <div><small>Primary patient</small><strong>{selectedAppointment.customerName}</strong><span>Date of birth · {formatDateOfBirth(selectedAppointment.customerDateOfBirth)}</span><a href={`mailto:${selectedAppointment.customerEmail}`}>{selectedAppointment.customerEmail}</a><a href={`tel:${selectedAppointment.customerPhone}`}>{selectedAppointment.customerPhone}</a></div>
                    {selectedAppointment.additionalPatients.length ? <div className={styles.detailFull}><small>Additional patients</small>{selectedAppointment.additionalPatients.map((patient, index) => <div className={styles.additionalPatientDetail} key={`${patient.email}-${index}`}><strong>{patient.fullName}</strong><span>Date of birth · {formatDateOfBirth(patient.dateOfBirth)}</span><a href={`mailto:${patient.email}`}>{patient.email}</a><a href={`tel:${patient.phone}`}>{patient.phone}</a></div>)}</div> : null}
                    <div><small>When</small><strong>{appointmentDate(selectedAppointment.startsAt, selectedAppointment.timezone)}</strong><span>{appointmentTimezoneLabel(selectedAppointment.startsAt, selectedAppointment.timezone)}</span><span>{selectedAppointment.timezone}</span></div>
                    <div className={styles.detailFull}><small>Service address</small><strong>{appointmentAddress(selectedAppointment) || "Address will be provided before the visit."}</strong>{appointmentAddress(selectedAppointment) ? <div className={styles.mapActions}><a href={mapUrl("google", appointmentAddress(selectedAppointment))} target="_blank" rel="noopener noreferrer">Open in Google Maps ↗</a><a href={mapUrl("apple", appointmentAddress(selectedAppointment))} target="_blank" rel="noopener noreferrer">Open in Apple Maps ↗</a></div> : null}</div>
                    <div><small>Appointment</small><strong>{selectedAppointment.reference}</strong><span>{appointmentStatusMeta(selectedAppointment.status).label}</span></div>
                    <div><small>Collection</small><strong>{money(selectedAppointment.amountDueAtVisit, selectedAppointment.currency)}</strong><span>Amount to collect at the appointment</span></div>
                  </div>
                  <div className={styles.detailDecisionActions}>
                    <span className={styles.detailDecisionLabel}>Appointment decision</span>
                    <div className={styles.detailDecisionButtons}>
                      {selectedAppointment.status === "completed" ? (
                        <div className={styles.detailCompletedState} role="status">
                          <span className={styles.detailCompletedIcon} aria-hidden="true">✓</span>
                          <span>
                            <strong>Appointment completed</strong>
                            <small>This visit was completed successfully. No further action is needed.</small>
                          </span>
                        </div>
                      ) : null}
                      {["payment_pending", "confirmed"].includes(selectedAppointment.status) ? <>
                        <button type="button" className={styles.detailAcceptButton} onClick={() => { const appointmentId = selectedAppointment.id; setSelectedAppointment(null); void advanceAppointment(appointmentId, "acknowledge"); }}>Accept appointment</button>
                        <button type="button" className={styles.detailDeclineButton} onClick={() => { const appointment = selectedAppointment; setSelectedAppointment(null); setDeclineTarget(appointment); setDeclineReason(""); }}>Decline</button>
                      </> : null}
                      {selectedAppointment.status === "partner_acknowledged" ? appointmentStartsInFuture(selectedAppointment.startsAt, now) ? <>
                        <span className={styles.detailTimingNotice} aria-live="polite">{appointmentCountdown(selectedAppointment.startsAt, now)} · Start visit unlocks at the scheduled time.</span>
                        <button type="button" className={styles.detailEarlyStartButton} onClick={() => { setSelectedAppointment(null); setEarlyStartTarget(selectedAppointment); setEarlyStartReason(""); }}>Start early</button>
                      </> : <button type="button" className={styles.detailAcceptButton} onClick={() => { const appointmentId = selectedAppointment.id; setSelectedAppointment(null); void advanceAppointment(appointmentId, "start"); }}>Start visit</button> : null}
                      {selectedAppointment.status === "in_progress" ? <button type="button" className={styles.detailAcceptButton} onClick={() => { const appointmentId = selectedAppointment.id; setSelectedAppointment(null); void advanceAppointment(appointmentId, "complete"); }}>Complete visit</button> : null}
                      {["confirmed", "partner_acknowledged"].includes(selectedAppointment.status) ? <button type="button" className={styles.detailSecondaryButton} onClick={() => openReschedule(selectedAppointment)}>Reschedule appointment</button> : null}
                      {!(["payment_pending", "confirmed", "partner_acknowledged", "in_progress"].includes(selectedAppointment.status)) && selectedAppointment.status !== "completed" ? <span className={styles.detailDecisionSaved}>No action needed for this appointment.</span> : null}
                    </div>
                  </div>
                </section>
              </div>
            ) : null}

            {screen === "appointments" && earlyStartTarget ? (
              <div className={styles.detailBackdrop} role="presentation" onClick={() => setEarlyStartTarget(null)}>
                <section className={styles.detailSheet} role="dialog" aria-modal="true" aria-labelledby="early-start-title" onClick={(event) => event.stopPropagation()}>
                  <div className={styles.detailHeader}>
                    <div><span>Appointment timing</span><h2 id="early-start-title">Start this visit early?</h2></div>
                    <button type="button" className={styles.closeDetail} onClick={() => setEarlyStartTarget(null)} aria-label="Close early start dialog">×</button>
                  </div>
                  <p className={styles.blockDialogCopy}>This visit is scheduled for <strong>{appointmentDate(earlyStartTarget.startsAt, earlyStartTarget.timezone)}</strong>. Use an early start only when you and the patient agreed to begin before the scheduled time. Your reason is recorded with the appointment.</p>
                  <label className={styles.declineReasonField}>Why are you starting early?<textarea value={earlyStartReason} onChange={(event) => setEarlyStartReason(event.target.value)} rows={5} maxLength={1000} required placeholder="For example: The patient arrived early and confirmed they are ready to begin." /></label>
                  <div className={styles.blockDialogActions}>
                    <button type="button" className={styles.blockDialogCancel} onClick={() => setEarlyStartTarget(null)}>Keep scheduled time</button>
                    <button type="button" className={styles.blockDialogConfirm} onClick={() => void startAppointmentEarly()} disabled={earlyStartSaving || earlyStartReason.trim().length < 3}>{earlyStartSaving ? "Starting…" : "Record early start"}</button>
                  </div>
                </section>
              </div>
            ) : null}

            {screen === "appointments" && declineTarget ? (
              <div className={styles.detailBackdrop} role="presentation" onClick={() => setDeclineTarget(null)}>
                <section className={styles.detailSheet} role="dialog" aria-modal="true" aria-labelledby="decline-appointment-title" onClick={(event) => event.stopPropagation()}>
                  <div className={styles.detailHeader}>
                    <div><span>Appointment decision</span><h2 id="decline-appointment-title">Decline this visit?</h2></div>
                    <button type="button" className={styles.closeDetail} onClick={() => setDeclineTarget(null)} aria-label="Close decline dialog">×</button>
                  </div>
                  <p className={styles.blockDialogCopy}>Tell us why you cannot attend. We will first look for another Partner who covers {declineTarget.county}, {declineTarget.state}. If no one is available, the client deposit will be refunded automatically.</p>
                  <label className={styles.declineReasonField}>Reason<textarea value={declineReason} onChange={(event) => setDeclineReason(event.target.value)} rows={5} maxLength={1000} required placeholder="For example: I am unavailable at this time." /></label>
                  <div className={styles.blockDialogActions}>
                    <button type="button" className={styles.blockDialogCancel} onClick={() => setDeclineTarget(null)}>Keep appointment</button>
                    <button type="button" className={styles.blockDialogConfirm} onClick={() => void declineAppointment()} disabled={declineSaving || declineReason.trim().length < 3}>{declineSaving ? "Processing…" : "Decline appointment"}</button>
                  </div>
                </section>
              </div>
            ) : null}

            {screen === "appointments" && rescheduleTarget ? (
              <div className={styles.detailBackdrop} role="presentation" onClick={() => setRescheduleTarget(null)}>
                <section className={styles.detailSheet} role="dialog" aria-modal="true" aria-labelledby="reschedule-appointment-title" onClick={(event) => event.stopPropagation()}>
                  <div className={styles.detailHeader}>
                    <div><span>Appointment timing</span><h2 id="reschedule-appointment-title">Reschedule this visit</h2></div>
                    <button type="button" className={styles.closeDetail} onClick={() => setRescheduleTarget(null)} aria-label="Close reschedule dialog">×</button>
                  </div>
                  <p className={styles.blockDialogCopy}>Choose a new time you and the client agreed to. The appointment remains accepted and the client will receive the updated details.</p>
                  <div className={styles.rescheduleGrid}>
                    <label>Date<input type="date" value={rescheduleDate} onChange={(event) => setRescheduleDate(event.target.value)} required /></label>
                    <label>Time<input type="time" value={rescheduleTime} onChange={(event) => setRescheduleTime(event.target.value)} required /></label>
                  </div>
                  <p className={styles.rescheduleTimezone}>Local time zone: {rescheduleTarget.timezone}. A minimum of two hours’ notice is required.</p>
                  <label className={styles.declineReasonField}>Reason (optional)<textarea value={rescheduleReason} onChange={(event) => setRescheduleReason(event.target.value)} rows={4} maxLength={1000} placeholder="For example: The client requested a later appointment." /></label>
                  <div className={styles.blockDialogActions}>
                    <button type="button" className={styles.blockDialogCancel} onClick={() => setRescheduleTarget(null)}>Keep current time</button>
                    <button type="button" className={styles.blockDialogConfirm} onClick={() => void rescheduleAppointment()} disabled={rescheduleSaving || !rescheduleDate || !rescheduleTime}>{rescheduleSaving ? "Saving…" : "Save new time"}</button>
                  </div>
                </section>
              </div>
            ) : null}

            {screen === "availability" ? <section className={styles.panel} id="availability">
              <div className={styles.panelHeading}><div><span>Booking calendar</span><h2>Weekly availability</h2></div><p>Patients only see times inside these hours. Every booking requires at least two hours of notice.</p></div>
              {availabilityEditor}
            </section> : null}

            {screen === "profile" ? <section className={styles.panel} id="profile">
              <div className={styles.panelHeading}><div><span>Public profile</span><h2>Your patient-facing information</h2></div><p>This content appears on your Partner website.</p></div>
              <form onSubmit={saveProfile} className={styles.form}>
                <div className={styles.photoEditor}>
                  <div className={styles.photoFrame}>{preview ? <img src={preview} alt="Partner profile preview" title={`${profile.displayName} Partner profile preview`} /> : <span>{initials(profile.displayName)}</span>}</div>
                  <div><strong>Professional photo</strong><p>JPG or PNG, maximum 5 MB. Your photo is saved securely to your Partner profile.</p><label><input type="file" accept="image/jpeg,image/png" onChange={(event) => selectPhoto(event.target.files?.[0] || null)} />Choose new photo</label></div>
                </div>
                <div className={styles.fields}>
                  <label>Professional title<input value={publicTitle} onChange={(event) => setPublicTitle(event.target.value)} minLength={2} maxLength={100} required /></label>
                  <label>Credentials <span>Optional</span><input value={credentials} onChange={(event) => setCredentials(event.target.value)} maxLength={100} placeholder="RN, BSN" /></label>
                  <label className={styles.full}>Biography <span>{biography.length}/700</span><textarea value={biography} onChange={(event) => setBiography(event.target.value)} minLength={120} maxLength={700} rows={8} required /></label>
                </div>
                {message ? <p className={styles.success}>{message}</p> : null}
                {error ? <p className={styles.error}>{error}</p> : null}
                <div className={styles.formActions}><button type="submit" disabled={saving}>{saving ? "Saving…" : "Save profile"}</button></div>
              </form>
            </section> : null}

            {screen === "website" ? <section className={styles.panel} id="website">
              <div className={styles.panelHeading}><div><span>Partner website</span><h2>Your reserved page</h2></div><span className={`${styles.status} ${styles[profile.websiteStatus]}`}>{profile.websiteStatus}</span></div>
              <div className={styles.websiteRow}><div><small>Public URL</small><strong>{websiteUrl.replace("https://", "")}</strong><p>{profile.websiteStatus === "published" ? "Your Partner website is live and ready to share." : "Review the private preview while My Drip Nurse completes its final website review."}</p></div><div className={styles.websiteRowActions}><a className={styles.websitePreviewLink} href={websitePreviewUrl} target="_blank" rel="noopener noreferrer">Open preview ↗</a>{profile.websiteStatus === "published" ? <a href={websiteUrl} target="_blank" rel="noopener noreferrer">View live website ↗</a> : <span className={styles.previewPending}>Admin review pending</span>}</div></div>
              <div className={styles.websitePreviewCard}>
                <div className={styles.websitePreviewHeader}>
                  <div><span>Private home preview</span><h3>See how patients will experience your Partner page.</h3></div>
                  <span className={styles.websitePreviewBadge}>Mobile-first</span>
                </div>
                <div className={styles.websitePreviewBrowser}>
                  <div className={styles.websitePreviewChrome} aria-hidden="true"><span /><span /><span /><small>{websiteUrl.replace("https://", "")}</small></div>
                  <iframe src={websitePreviewUrl} title={`${profile.displayName} Partner website preview`} loading="lazy" />
                </div>
                <p className={styles.websitePreviewNote}>This preview uses your current profile photo, biography, service areas, and active services. Changes appear here automatically after they are saved.</p>
              </div>
            </section> : null}

            {screen === "services" ? <section className={styles.panel} id="services">
              <div className={styles.panelHeading}><div><span>Services</span><h2>Your service catalog</h2></div><strong>{catalogServices.filter((service) => service.active).length} of {catalogServices.length} active</strong></div>
              <p className={styles.catalogIntro}>Choose the treatments you want to offer. Pausing a service removes it from your Partner website and stops new booking availability; you can turn it back on anytime.</p>
              {servicesLoading ? <p className={styles.schedulePlaceholder}>Loading your service catalog…</p> : null}
              {servicesError ? <p className={styles.error}>{servicesError}</p> : null}
              {serviceNotice ? <p className={styles.success}>{serviceNotice}</p> : null}
              {!servicesLoading && !catalogServices.length ? <p className={styles.emptyAppointments}>Your service catalog is being prepared by the My Drip Nurse team.</p> : null}
              <div className={styles.partnerCatalogGrid}>
                {catalogServices.map((service) => {
                  const deposit = serviceDepositAmount(service);
                  const earnings = servicePartnerEarnings(service);
                  return <article className={`${styles.partnerCatalogCard} ${service.active ? styles.partnerCatalogCardActive : ""}`} key={service.id}>
                    <div className={styles.partnerCatalogMedia}>
                      {service.imageUrl ? <img src={service.imageUrl} alt={`${service.name} IV therapy`} title={`${service.name} mobile IV therapy`} loading="lazy" /> : <span>{initials(service.name)}</span>}
                      <span className={`${styles.partnerCatalogState} ${service.active ? styles.partnerCatalogStateActive : styles.partnerCatalogStatePaused}`}>{service.active ? "Offered" : "Paused"}</span>
                    </div>
                    <div className={styles.partnerCatalogBody}>
                      <h3>{service.name}</h3>
                      <p>{service.description || "Mobile IV therapy delivered by your My Drip Nurse Partner team."}</p>
                      {service.ingredients.length ? <div className={styles.partnerCatalogIngredients}>{service.ingredients.slice(0, 5).map((ingredient) => <span key={ingredient}>{ingredient}</span>)}</div> : null}
                      <div className={styles.partnerCatalogFinancials}>
                        <div><small>Service price</small><strong>{service.effectivePrice === null ? "Set by My Drip Nurse" : money(service.effectivePrice, service.currency)}</strong></div>
                        <div><small>Booking deposit</small><strong>{deposit === null ? "Configured at booking" : money(deposit, service.currency)}</strong></div>
                        <div className={styles.partnerCatalogEarnings}><small>Your estimated earnings after deposit</small><strong>{earnings === null ? "Calculated at booking" : money(earnings, service.currency)}</strong></div>
                      </div>
                      <button type="button" className={service.active ? styles.partnerCatalogPause : styles.partnerCatalogOffer} onClick={() => void toggleCatalogService(service)} disabled={serviceSaving === service.slug}>{serviceSaving === service.slug ? "Updating…" : service.active ? "Pause this service" : "Offer this service"}</button>
                    </div>
                  </article>;
                })}
              </div>
              <form className={styles.suggestionForm} onSubmit={submitServiceSuggestion}>
                <div className={styles.suggestionHeading}><div><span>Partner feedback</span><h3>Suggest a service or recipe</h3></div><small>Our Admin team reviews every suggestion.</small></div>
                <div className={styles.suggestionFields}>
                  <label>Suggestion type<select value={suggestionType} onChange={(event) => setSuggestionType(event.target.value)}><option value="service">New service</option><option value="recipe">Recipe or ingredient</option><option value="other">Other idea</option></select></label>
                  <label>Name<input value={suggestionName} onChange={(event) => setSuggestionName(event.target.value)} required minLength={2} maxLength={160} placeholder="e.g. Recovery IV" /></label>
                  <label>Ingredients <span>Optional</span><textarea value={suggestionIngredients} onChange={(event) => setSuggestionIngredients(event.target.value)} rows={3} placeholder="One ingredient per line" /></label>
                  <label>Details <span>Optional</span><textarea value={suggestionDetails} onChange={(event) => setSuggestionDetails(event.target.value)} rows={3} maxLength={4000} placeholder="Tell us what patients should receive and why it helps." /></label>
                </div>
                <div className={styles.formActions}><button type="submit">Send suggestion</button></div>
                {suggestionNotice ? <p className={styles.success}>{suggestionNotice}</p> : null}
              </form>
            </section> : null}

            {screen === "affiliates" ? <section className={`${styles.panel} ${styles.affiliateDashboard}`} id="affiliates">
              <div className={styles.panelHeading}><div><span>Affiliate center</span><h2>Your referral earnings</h2></div><span className={styles.affiliateRateBadge}>{affiliateDashboard?.commissionRate ?? 2}% commission</span></div>
              {affiliateLoading ? <p className={styles.schedulePlaceholder}>Loading your referral activity…</p> : null}
              {affiliateError ? <p className={styles.error}>{affiliateError}</p> : null}
              {affiliateDashboard ? <>
                <div className={styles.affiliateHero}>
                  <div><span>Share your Partner page</span><h3>Invite qualified healthcare professionals.</h3><p>Every confirmed appointment generated by a Partner you refer is tracked here automatically.</p></div>
                  <div className={styles.affiliateLink}><small>Your referral link</small><strong>{affiliateDashboard.affiliateUrl.replace("https://", "")}</strong><button type="button" onClick={() => void navigator.clipboard.writeText(affiliateDashboard.affiliateUrl)}>Copy link</button></div>
                </div>
                <div className={styles.affiliateKpis} aria-label="Affiliate earnings summary">
                  <article className={styles.affiliateMetric}><small>Total earned</small><strong>{money(affiliateDashboard.metrics.totalEarned, "USD")}</strong><span>All attributed appointments</span></article>
                  <article className={styles.affiliateMetric}><small>Pending</small><strong>{money(affiliateDashboard.metrics.pending, "USD")}</strong><span>Awaiting approval or payout</span></article>
                  <article className={styles.affiliateMetric}><small>Paid</small><strong>{money(affiliateDashboard.metrics.paid, "USD")}</strong><span>Completed payouts</span></article>
                  <article className={styles.affiliateMetric}><small>Referred partners</small><strong>{affiliateDashboard.metrics.referredPartners}</strong><span>{affiliateDashboard.metrics.appointments} attributed appointments</span></article>
                </div>
                <div className={styles.affiliateSection}><div className={styles.affiliateSectionHeading}><div><span>Your network</span><h3>Partners you referred</h3></div><small>{affiliateDashboard.metrics.referredPartners} total</small></div>
                  {affiliateDashboard.referredPartners.length ? <div className={styles.affiliatePartnerList}>{affiliateDashboard.referredPartners.map((partner) => <article className={styles.affiliatePartnerCard} key={partner.id}><div className={styles.affiliatePartnerIdentity}><span>{initials(partner.displayName)}</span><div><strong>{partner.displayName}</strong><small>{partner.businessName || "My Drip Nurse Partner"}</small></div></div><div><small>Appointments</small><strong>{partner.appointmentCount}</strong></div><div><small>Earned</small><strong>{money(partner.totalEarned, "USD")}</strong></div><span className={`${styles.status} ${styles[partner.websiteStatus]}`}>{partner.websiteStatus}</span></article>)}</div> : <p className={styles.emptyAppointments}>Partners who join through your referral page will appear here.</p>}
                </div>
                <div className={styles.affiliateSection}><div className={styles.affiliateSectionHeading}><div><span>Commission activity</span><h3>Recent attributed appointments</h3></div><small>2% default · profile overrides apply</small></div>
                  {affiliateDashboard.commissions.length ? <div className={styles.affiliateCommissionList}>{affiliateDashboard.commissions.map((item) => <article className={styles.affiliateCommissionRow} key={item.id}><div><strong>{item.serviceName}</strong><small>{item.partnerName} · {item.reference}</small></div><div><strong>{money(item.amount, item.currency)}</strong><small>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(item.appointmentAt))} · {item.rate}%</small></div><span className={styles.affiliateCommissionStatus}>{item.status.replaceAll("_", " ")}</span></article>)}</div> : <p className={styles.emptyAppointments}>No attributed appointments yet. Your first referral will be tracked after the appointment is confirmed.</p>}
                </div>
              </> : null}
            </section> : null}

            {screen === "support" ? <section className={`${styles.panel} ${styles.supportWorkspace}`} id="support">
              <div className={styles.panelHeading}><div><span>Partner Support</span><h2>We’re here to help.</h2></div><span className={styles.supportStatus}><i />Secure ticket history</span></div>
              <p className={styles.supportIntro}>Start a ticket for appointments, your website, payments or services. Replies from the My Drip Nurse team stay in one organized conversation.</p>
              <div className={styles.supportLayout}>
                <form className={styles.supportComposer} onSubmit={submitSupport}>
                  <div><span className={styles.supportEyebrow}>New conversation</span><h3>How can we help?</h3></div>
                  <label>Subject<input value={supportSubject} onChange={(event) => setSupportSubject(event.target.value)} minLength={3} maxLength={160} required placeholder="Tell us what you need help with" /></label>
                  <div className={styles.supportFieldGrid}>
                    <label>Topic<select value={supportCategory} onChange={(event) => setSupportCategory(event.target.value)}><option value="general">General question</option><option value="appointments">Appointments</option><option value="website">Partner website</option><option value="payments">Payments</option><option value="services">Services</option></select></label>
                    <label>Priority<select value={supportPriority} onChange={(event) => setSupportPriority(event.target.value)}><option value="normal">Normal</option><option value="low">Low</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
                  </div>
                  <label>Message<textarea value={supportMessage} onChange={(event) => setSupportMessage(event.target.value)} minLength={2} maxLength={5000} rows={6} required placeholder="Share the details our support team should know…" /></label>
                  <div className={styles.formActions}><button type="submit" disabled={supportSubmitting}>{supportSubmitting ? "Sending…" : "Open support ticket"}</button></div>
                </form>
                <div className={styles.supportHistory}>
                  <div className={styles.supportHistoryHeader}><div><span className={styles.supportEyebrow}>Your history</span><h3>Open conversations</h3></div><strong>{supportTickets.filter((ticket) => ticket.status !== "closed").length} open</strong></div>
                  {supportLoading ? <p className={styles.schedulePlaceholder}>Loading your support history…</p> : null}
                  {!supportLoading && !supportTickets.length ? <div className={styles.supportEmpty}><span>✦</span><strong>No tickets yet</strong><p>When you need us, start a conversation and we’ll keep every reply here.</p></div> : null}
                  <div className={styles.supportTicketList}>{supportTickets.map((ticket) => <article className={styles.supportTicket} key={ticket.id}>
                    <div className={styles.supportTicketHeader}><div><span className={styles.supportTicketMeta}>{ticket.category} · {ticket.priority}</span><h4>{ticket.subject}</h4></div><span className={`${styles.supportTicketStatus} ${styles[`supportStatus_${ticket.status}`]}`}>{ticket.status}</span></div>
                    <div className={styles.supportMessages}>{ticket.messages.map((item) => <div className={`${styles.supportMessage} ${item.authorType === "partner" ? styles.supportMessagePartner : styles.supportMessageAdmin}`} key={item.id}><div><strong>{item.authorName}</strong><time>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</time></div><p>{item.body}</p></div>)}</div>
                    {ticket.status !== "closed" ? <div className={styles.supportReply}><textarea rows={2} value={supportReply[ticket.id] || ""} onChange={(event) => setSupportReply((current) => ({ ...current, [ticket.id]: event.target.value }))} placeholder="Reply to this ticket…" /><button type="button" onClick={() => void sendSupportReply(ticket.id)} disabled={supportSubmitting || !String(supportReply[ticket.id] || "").trim()}>Reply</button></div> : <p className={styles.supportClosedNote}>This ticket is closed. Open a new ticket if you need more help.</p>}
                  </article>)}</div>
                </div>
              </div>
              {supportNotice ? <p className={styles.success}>{supportNotice}</p> : null}
              {supportError ? <p className={styles.error}>{supportError}</p> : null}
            </section> : null}
          </div>
          <nav ref={mobileNavRef} className={styles.mobileBottomNav} aria-label="Quick navigation">
            <Link href="/partner-portal" data-active={screen === "overview" ? "true" : "false"} className={screen === "overview" ? styles.mobileBottomActive : ""}><span className={styles.navIcon}><PortalIcon name="home" /></span><small>Home</small></Link>
            <Link href="/partner-portal/appointments" data-active={screen === "appointments" ? "true" : "false"} className={screen === "appointments" ? styles.mobileBottomActive : ""}><span className={styles.navIcon}><PortalIcon name="calendar" /></span><small>Appointments</small></Link>
            <Link href="/partner-portal/website" data-active={screen === "website" ? "true" : "false"} className={screen === "website" ? styles.mobileBottomActive : ""}><span className={styles.navIcon}><PortalIcon name="website" /></span><small>Website</small></Link>
            <Link href="/partner-portal/services" data-active={screen === "services" ? "true" : "false"} className={screen === "services" ? styles.mobileBottomActive : ""}><span className={styles.navIcon}><PortalIcon name="services" /></span><small>Services</small></Link>
            <Link href="/partner-portal/affiliates" data-active={screen === "affiliates" ? "true" : "false"} className={screen === "affiliates" ? styles.mobileBottomActive : ""}><span className={styles.navIcon}><PortalIcon name="affiliates" /></span><small>Affiliates</small></Link>
            <Link href="/partner-portal/support" data-active={screen === "support" ? "true" : "false"} className={screen === "support" ? styles.mobileBottomActive : ""}><span className={styles.navIcon}><PortalIcon name="support" /></span><small>Support</small></Link>
          </nav>
        </main>
      </div>
    </PartnerExperience>
  );
}
