"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";

import { PartnerExperience } from "@/components/partner/PartnerBrand";
import { ComingSoonFeature } from "@/components/portal/ComingSoonFeature";
import { PortalLanguageSelector } from "@/components/portal/PortalLanguageSelector";
import { usePortalLocale } from "@/components/portal/PortalLocaleProvider";
import type { PartnerPortalProfile } from "@/lib/partnerProfiles";
import type { PartnerPortalAppointment, PartnerPortalDashboard } from "@/lib/partnerAppointments";
import type { PartnerPortalNotification } from "@/lib/partnerPortalNotifications";
import type { SupportTicket } from "@/lib/partnerSupport";

import styles from "./partnerPortal.module.css";
import AppointmentOfferMap, { type AppointmentMapRoute } from "./AppointmentOfferMap";
import PartnerOnboardingTour, { type PartnerTourPhase } from "./PartnerOnboardingTour";

export type PartnerPortalScreen = "overview" | "appointments" | "availability" | "profile" | "website" | "directory" | "services" | "affiliates" | "support" | "rewards" | "products";
type Props = { initialProfile: PartnerPortalProfile; screen?: PartnerPortalScreen };
type AvailabilityDay = { dayOfWeek: number; enabled: boolean; startTime: string; endTime: string };
type CalendarViewMode = "month" | "week" | "list";
type BlockRange = { date: string; startTime: string; endTime: string };
type AppointmentOfferRoute = {
  status: "idle" | "locating" | "loading" | "ready" | "unavailable" | "error";
  distanceMiles: number | null;
  durationMinutes: number | null;
  message: string;
  mapRoute: AppointmentMapRoute | null;
};
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
export type PartnerPwaInstallState = "checking" | "available" | "ios" | "manual" | "installed";
export type PartnerPushState = "checking" | "ready" | "subscribed" | "denied" | "unsupported" | "unavailable" | "error";
type PortalIconName = "home" | "calendar" | "user" | "website" | "directory" | "services" | "affiliates" | "support" | "rewards" | "products";
type DirectoryDashboard = {
  range: { startDate: string; endDate: string; days: number };
  metrics: { impressions: number; profileClicks: number; bookingClicks: number; bookings: number; clickThroughRate: number; bookingConversionRate: number };
  trend: Array<{ date: string; impressions: number; profileClicks: number; bookingClicks: number; bookings: number }>;
  readiness: { availabilityConfigured: boolean; acceptanceRate: number; completedAppointments: number; organicScore: number };
};
type DirectoryMetricKey = "impressions" | "profileClicks" | "bookingClicks" | "bookings";
type DirectoryRangePreset = "7d" | "30d" | "90d" | "12m" | "custom";

const DIRECTORY_METRICS: Record<DirectoryMetricKey, { label: string; shortLabel: string; color: string }> = {
  impressions: { label: "Impressions", shortLabel: "Times shown", color: "#3974d7" },
  profileClicks: { label: "Profile clicks", shortLabel: "Profile visits", color: "#087f8c" },
  bookingClicks: { label: "Booking starts", shortLabel: "Booking intent", color: "#d1842f" },
  bookings: { label: "Bookings", shortLabel: "Directory appointments", color: "#7958c8" },
};
type AffiliateDashboard = {
  affiliateUrl: string;
  affiliateCode: string;
  globalRate: number;
  commissionRate: number;
  metrics: { totalEarned: number; pending: number; paid: number; appointments: number; referredPartners: number };
  referredPartners: Array<{ id: string; displayName: string; businessName: string; websiteStatus: string; joinedAt: string; appointmentCount: number; totalEarned: number; pending: number; paid: number }>;
  commissions: Array<{ id: string; appointmentId: string; reference: string; partnerName: string; serviceName: string; appointmentAt: string; amount: number; rate: number; currency: string; status: string }>;
};

const TOUR_AFFILIATE_PARTNER_ID = "tour-demo-affiliate-partner";
const TOUR_AFFILIATE_COMMISSION_ID = "tour-demo-affiliate-commission";

function withAffiliateTourDemo(dashboard: AffiliateDashboard | null, affiliateUrl: string): AffiliateDashboard {
  const base: AffiliateDashboard = dashboard || {
    affiliateUrl,
    affiliateCode: "partner-demo",
    globalRate: 2,
    commissionRate: 2,
    metrics: { totalEarned: 0, pending: 0, paid: 0, appointments: 0, referredPartners: 0 },
    referredPartners: [],
    commissions: [],
  };
  const demoAmount = 18.5;
  return {
    ...base,
    metrics: {
      totalEarned: base.metrics.totalEarned + demoAmount,
      pending: base.metrics.pending + demoAmount,
      paid: base.metrics.paid,
      appointments: base.metrics.appointments + 1,
      referredPartners: base.metrics.referredPartners + 1,
    },
    referredPartners: [{
      id: TOUR_AFFILIATE_PARTNER_ID,
      displayName: "Alex Rivera",
      businessName: "Rivera Mobile Wellness",
      websiteStatus: "active",
      joinedAt: "2026-08-01T14:00:00.000Z",
      appointmentCount: 1,
      totalEarned: demoAmount,
      pending: demoAmount,
      paid: 0,
    }, ...base.referredPartners],
    commissions: [{
      id: TOUR_AFFILIATE_COMMISSION_ID,
      appointmentId: "tour-demo-affiliate-appointment",
      reference: "DEMO-AFF-001",
      partnerName: "Alex Rivera",
      serviceName: "NAD+ Premium IV",
      appointmentAt: "2026-08-08T15:00:00.000Z",
      amount: demoAmount,
      rate: base.commissionRate,
      currency: "USD",
      status: "pending",
    }, ...base.commissions],
  };
}
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
  status: "active" | "paused" | "out_of_stock";
  active: boolean;
  outOfStock: boolean;
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const PROFESSIONAL_ROLE_OPTIONS = [
  "Registered Nurse",
  "Nurse Practitioner",
  "Advanced Practice Registered Nurse",
  "Licensed Practical Nurse",
  "Licensed Vocational Nurse",
  "Physician Assistant",
  "Physician",
  "Paramedic",
  "Emergency Medical Technician",
];
const PROFESSIONAL_CREDENTIAL_OPTIONS = [
  { value: "RN", label: "RN", description: "Registered Nurse" },
  { value: "BSN", label: "BSN", description: "Bachelor of Science in Nursing" },
  { value: "MSN", label: "MSN", description: "Master of Science in Nursing" },
  { value: "DNP", label: "DNP", description: "Doctor of Nursing Practice" },
  { value: "APRN", label: "APRN", description: "Advanced Practice Registered Nurse" },
  { value: "NP", label: "NP", description: "Nurse Practitioner" },
  { value: "FNP-C", label: "FNP-C", description: "Family Nurse Practitioner — Certified" },
  { value: "CRNA", label: "CRNA", description: "Certified Registered Nurse Anesthetist" },
  { value: "CCRN", label: "CCRN", description: "Critical Care Registered Nurse" },
  { value: "LPN", label: "LPN", description: "Licensed Practical Nurse" },
  { value: "LVN", label: "LVN", description: "Licensed Vocational Nurse" },
  { value: "PA-C", label: "PA-C", description: "Physician Assistant — Certified" },
  { value: "MD", label: "MD", description: "Medical Doctor" },
  { value: "DO", label: "DO", description: "Doctor of Osteopathic Medicine" },
  { value: "EMT", label: "EMT", description: "Emergency Medical Technician" },
  { value: "Paramedic", label: "Paramedic", description: "Licensed Paramedic" },
];
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

async function prepareProfilePhoto(file: File) {
  if (file.size <= 1.5 * 1024 * 1024) return file;
  const bitmap = await createImageBitmap(file);
  const maxDimension = 1400;
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Unable to prepare this photo. Please choose another JPG or PNG image.");
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.84));
  if (!blob) throw new Error("Unable to prepare this photo. Please choose another JPG or PNG image.");
  return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "profile-photo"}.jpg`, { type: "image/jpeg" });
}

function PortalIcon({ name }: { name: PortalIconName }) {
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

function createTourDemoAppointment(timezone: string): PartnerPortalAppointment {
  const startsAt = new Date();
  startsAt.setDate(startsAt.getDate() + 3);
  startsAt.setHours(10, 0, 0, 0);
  const endsAt = new Date(startsAt.getTime() + (60 * 60 * 1000));
  return {
    id: "tour-demo-appointment",
    reference: "DEMO-001",
    serviceName: "Myers' Cocktail · Practice visit",
    serviceImageUrl: "",
    serviceImageAlt: "Myers' Cocktail",
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    timezone,
    status: "confirmed",
    customerName: "Demo Patient",
    customerEmail: "practice@example.com",
    customerPhone: "(555) 010-2026",
    customerDateOfBirth: "1990-01-15",
    customerWeight: "",
    customerHeight: "",
    customerBmi: null,
    additionalPatients: [],
    address: "Practice address",
    county: "Demo County",
    city: "Your city",
    state: "FL",
    postalCode: "00000",
    amountDueAtVisit: 175,
    partnerEarnings: 175,
    platformFundedReward: false,
    platformFundedAmount: 0,
    currency: "USD",
  };
}

function appointmentLocalParts(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: timezone,
  }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

function appointmentIsOutsideStartWindow(value: string, now = Date.now()) {
  return new Date(value).getTime() > now + (60 * 60 * 1000);
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

function formatPatientMeasurements(weightValue: string, heightValue: string, bmi: number | null) {
  const measurements: string[] = [];
  if (bmi !== null) measurements.push(`BMI · ${bmi.toFixed(1)}`);

  const weight = Number(weightValue);
  if (Number.isFinite(weight) && weight > 0) measurements.push(`Weight · ${weight} lb`);

  const totalInches = Number(heightValue);
  if (Number.isFinite(totalInches) && totalInches > 0) {
    const roundedInches = Math.round(totalInches);
    measurements.push(`Height · ${Math.floor(roundedInches / 12)} ft ${roundedInches % 12} in`);
  }

  return measurements.join(" · ");
}

function displayBlockedDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(year, month - 1, day));
}

function directoryDateOffset(daysAgo: number) {
  const value = new Date();
  value.setHours(0, 0, 0, 0);
  value.setDate(value.getDate() - daysAgo);
  return value.toISOString().slice(0, 10);
}

function directoryPresetRange(preset: Exclude<DirectoryRangePreset, "custom">) {
  const days = preset === "7d" ? 7 : preset === "30d" ? 30 : preset === "90d" ? 90 : 365;
  return { startDate: directoryDateOffset(days - 1), endDate: directoryDateOffset(0) };
}

function directoryRangeLabel(range: DirectoryDashboard["range"] | null) {
  if (!range) return "Selected period";
  const format = (value: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T00:00:00`));
  return `${format(range.startDate)} – ${format(range.endDate)}`;
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

function isAppointmentOffer(appointment: PartnerPortalAppointment | null) {
  return Boolean(appointment && appointment.id !== "tour-demo-appointment" && ["payment_pending", "confirmed"].includes(appointment.status));
}

function offerArea(appointment: PartnerPortalAppointment) {
  return [appointment.city, appointment.county, appointment.state].filter(Boolean).join(", ") || "Appointment area";
}

function notificationDestination(notification: PartnerPortalNotification) {
  if (notification.actionUrl) return notification.actionUrl;
  if (notification.appointmentId) {
    return `/partner-portal/appointments?appointment=${encodeURIComponent(notification.appointmentId)}&offer=1`;
  }
  const eventType = notification.eventType.toLowerCase();
  if (eventType.includes("profile")) return "/partner-portal/profile";
  if (eventType.includes("website")) return "/partner-portal/website";
  if (eventType.includes("service")) return "/partner-portal/services";
  if (eventType.includes("affiliate") || eventType.includes("commission") || eventType.includes("payout")) return "/partner-portal/affiliates";
  if (eventType.includes("support") || eventType.includes("ticket")) return "/partner-portal/support";
  if (eventType.includes("availability") || eventType.includes("schedule")) return "/partner-portal/availability";
  return "/partner-portal";
}

function pushApplicationServerKey(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const raw = window.atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

export default function PartnerPortalClient({ initialProfile, screen = "overview" }: Props) {
  const { locale, t } = usePortalLocale();
  const [profile, setProfile] = useState(initialProfile);
  const [displayName, setDisplayName] = useState(initialProfile.displayName);
  const [businessName, setBusinessName] = useState(initialProfile.businessName);
  const [publicTitle, setPublicTitle] = useState(initialProfile.publicTitle);
  const [credentials, setCredentials] = useState(initialProfile.professionalCredentials);
  const [biography, setBiography] = useState(initialProfile.biography);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState(initialProfile.profilePhotoUrl);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [notifications, setNotifications] = useState<PartnerPortalNotification[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsReadIds, setNotificationsReadIds] = useState<string[]>([]);
  const [notificationsError, setNotificationsError] = useState("");
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [pwaInstallState, setPwaInstallState] = useState<PartnerPwaInstallState>("checking");
  const [installNotice, setInstallNotice] = useState("");
  const [installHelpOpen, setInstallHelpOpen] = useState(false);
  const [pushState, setPushState] = useState<PartnerPushState>("checking");
  const [pushPublicKey, setPushPublicKey] = useState("");
  const [pushNotice, setPushNotice] = useState("");
  const topbarActionsRef = useRef<HTMLDivElement | null>(null);
  const calendarOverflowRef = useRef<HTMLDivElement | null>(null);
  const notificationTargetHandledRef = useRef(false);
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
  const [appointmentsLoaded, setAppointmentsLoaded] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<PartnerPortalAppointment | null>(null);
  const [offerRoute, setOfferRoute] = useState<AppointmentOfferRoute>({ status: "idle", distanceMiles: null, durationMinutes: null, message: "", mapRoute: null });
  const [partnerTourPhase, setPartnerTourPhase] = useState<PartnerTourPhase>(null);
  const [tourDemoAppointment, setTourDemoAppointment] = useState<PartnerPortalAppointment | null>(null);
  const [tourPracticeDate, setTourPracticeDate] = useState("");
  const [tourBlockPreview, setTourBlockPreview] = useState(false);
  const [tourDemoDecision, setTourDemoDecision] = useState<"accepted" | "declined" | null>(null);
  const [selectedBlockDate, setSelectedBlockDate] = useState<string | null>(null);
  const [blockMode, setBlockMode] = useState<"full" | "partial">("full");
  const [blockStartTime, setBlockStartTime] = useState("09:00");
  const [blockEndTime, setBlockEndTime] = useState("17:00");
  const [calendarView, setCalendarView] = useState<CalendarViewMode>("month");
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => appointmentDayKey(new Date().toISOString(), "America/New_York"));
  const [expandedCalendarDate, setExpandedCalendarDate] = useState<string | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [desktopTourEnabled, setDesktopTourEnabled] = useState(false);
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
  const [directoryDashboard, setDirectoryDashboard] = useState<DirectoryDashboard | null>(null);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryError, setDirectoryError] = useState("");
  const [directoryRangePreset, setDirectoryRangePreset] = useState<DirectoryRangePreset>("30d");
  const [directoryDateRange, setDirectoryDateRange] = useState(() => directoryPresetRange("30d"));
  const [directoryCustomDraft, setDirectoryCustomDraft] = useState(() => directoryPresetRange("30d"));
  const [activeDirectoryMetrics, setActiveDirectoryMetrics] = useState<DirectoryMetricKey[]>(["impressions", "profileClicks"]);
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
  const offerMapToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim() || "";
  const websiteUrl = `https://partners.mydripnurse.com/${profile.slug}`;
  const websitePreviewUrl = `${websiteUrl}?preview=${encodeURIComponent(profile.applicationId)}`;
  const affiliateUrl = `${websiteUrl}/become-a-partner`;
  const affiliateDisplayDashboard = partnerTourPhase === "affiliate-walkthrough"
    ? withAffiliateTourDemo(affiliateDashboard, affiliateUrl)
    : affiliateDashboard;
  const directoryChartModel = useMemo(() => {
    const trend = directoryDashboard?.trend || [];
    const width = 1000;
    const height = 260;
    const top = 18;
    const bottom = 34;
    const chartHeight = height - top - bottom;
    const x = (index: number) => trend.length <= 1 ? width / 2 : (index / (trend.length - 1)) * width;
    const series = activeDirectoryMetrics.map((key) => {
      const max = Math.max(1, ...trend.map((point) => point[key]));
      const points = trend.map((point, index) => ({ x: x(index), y: top + chartHeight - (point[key] / max) * chartHeight, value: point[key], date: point.date }));
      const path = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
      return { key, max, points, path, ...DIRECTORY_METRICS[key] };
    });
    const labelIndexes = trend.length <= 1 ? [0] : [0, Math.floor((trend.length - 1) / 2), trend.length - 1];
    return { width, height, top, bottom, series, labelIndexes: [...new Set(labelIndexes)].filter((index) => trend[index]), trend };
  }, [activeDirectoryMetrics, directoryDashboard]);

  function selectDirectoryRange(preset: DirectoryRangePreset) {
    setDirectoryRangePreset(preset);
    if (preset === "custom") return;
    const nextRange = directoryPresetRange(preset);
    setDirectoryDateRange(nextRange);
    setDirectoryCustomDraft(nextRange);
  }

  function applyDirectoryCustomRange() {
    if (!directoryCustomDraft.startDate || !directoryCustomDraft.endDate || directoryCustomDraft.startDate > directoryCustomDraft.endDate) {
      setDirectoryError("Choose a valid start and end date.");
      return;
    }
    setDirectoryError("");
    setDirectoryDateRange(directoryCustomDraft);
  }

  function toggleDirectoryMetric(metric: DirectoryMetricKey) {
    setActiveDirectoryMetrics((current) => {
      if (current.includes(metric)) return current.length === 1 ? current : current.filter((item) => item !== metric);
      return [...current, metric];
    });
  }
  const calendarYear = calendarMonth.getFullYear();
  const calendarMonthIndex = calendarMonth.getMonth();
  const displayLocale = locale === "es" ? "es-US" : "en-US";
  const monthLabel = new Intl.DateTimeFormat(displayLocale, { month: "long", year: "numeric" }).format(calendarMonth);
  const firstWeekday = new Date(calendarYear, calendarMonthIndex, 1).getDay();
  const daysInMonth = new Date(calendarYear, calendarMonthIndex + 1, 0).getDate();
  const todayKey = appointmentDayKey(new Date(now).toISOString(), timezone);
  const calendarCells = Array.from({ length: Math.ceil((firstWeekday + daysInMonth) / 7) * 7 }, (_, index) => {
    const day = index - firstWeekday + 1;
    const key = day > 0 && day <= daysInMonth
      ? `${calendarYear}-${String(calendarMonthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
      : null;
    return { day: day > 0 && day <= daysInMonth ? day : null, key };
  });
  const calendarAppointments = tourDemoAppointment ? [tourDemoAppointment, ...appointments] : appointments;
  const appointmentsByDay = calendarAppointments.reduce<Record<string, PartnerPortalAppointment[]>>((groups, appointment) => {
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
  const unreadNotificationItems = notifications.filter((notification) => !notification.readAt && !notificationsReadIds.includes(notification.id));
  const unreadNotifications = unreadNotificationItems.length;
  const markNotificationRead = (notificationId: string) => {
    setNotificationsReadIds((current) => {
      if (current.includes(notificationId)) return current;
      const next = [...current, notificationId];
      try { window.localStorage.setItem(notificationReadStorageKey, JSON.stringify(next)); } catch { /* storage may be unavailable */ }
      return next;
    });
  };

  const requestOfferDistance = useCallback(async () => {
    if (!selectedAppointment || !isAppointmentOffer(selectedAppointment)) return;
    if (!navigator.geolocation) {
      setOfferRoute({ status: "unavailable", distanceMiles: null, durationMinutes: null, message: "Location is not supported on this device.", mapRoute: null });
      return;
    }
    const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim() || "";
    if (!mapboxToken) {
      setOfferRoute({ status: "unavailable", distanceMiles: null, durationMinutes: null, message: "Distance preview is temporarily unavailable.", mapRoute: null });
      return;
    }
    setOfferRoute({ status: "locating", distanceMiles: null, durationMinutes: null, message: "Finding your current location…", mapRoute: null });
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 });
      });
      setOfferRoute({ status: "loading", distanceMiles: null, durationMinutes: null, message: "Calculating your drive…", mapRoute: null });
      const address = appointmentAddress(selectedAppointment);
      const geocodeResponse = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?limit=1&country=US,CA&access_token=${encodeURIComponent(mapboxToken)}`);
      if (!geocodeResponse.ok) throw new Error("The appointment area could not be located.");
      const geocodePayload = await geocodeResponse.json() as { features?: Array<{ center?: [number, number] }> };
      const destination = geocodePayload.features?.[0]?.center;
      if (!destination) throw new Error("The appointment area could not be located.");
      const origin: [number, number] = [position.coords.longitude, position.coords.latitude];
      const routeResponse = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${origin[0]},${origin[1]};${destination[0]},${destination[1]}?geometries=geojson&overview=full&steps=false&access_token=${encodeURIComponent(mapboxToken)}`);
      if (!routeResponse.ok) throw new Error("Driving distance is temporarily unavailable.");
      const routePayload = await routeResponse.json() as { routes?: Array<{ distance?: number; duration?: number; geometry?: { type?: string; coordinates?: [number, number][] } }> };
      const route = routePayload.routes?.[0];
      if (!route || typeof route.distance !== "number" || typeof route.duration !== "number" || route.geometry?.type !== "LineString" || !route.geometry.coordinates?.length) throw new Error("No driving route was found.");
      setOfferRoute({
        status: "ready",
        distanceMiles: Math.round((route.distance / 1609.344) * 10) / 10,
        durationMinutes: Math.max(1, Math.round(route.duration / 60)),
        message: "Live estimate from your current location",
        mapRoute: { origin, destination, geometry: { type: "LineString", coordinates: route.geometry.coordinates } },
      });
    } catch (error) {
      const locationError = error as { code?: number };
      const denied = locationError?.code === 1;
      setOfferRoute({
        status: denied ? "unavailable" : "error",
        distanceMiles: null,
        durationMinutes: null,
        message: denied ? "Location was not shared. You can still accept or decline." : (error instanceof Error ? error.message : "Distance preview is temporarily unavailable."),
        mapRoute: null,
      });
    }
  }, [selectedAppointment]);

  useEffect(() => {
    setOfferRoute({ status: "idle", distanceMiles: null, durationMinutes: null, message: "", mapRoute: null });
    if (!isAppointmentOffer(selectedAppointment) || !navigator.permissions?.query) return;
    let active = true;
    void navigator.permissions.query({ name: "geolocation" }).then((permission) => {
      if (active && permission.state === "granted") void requestOfferDistance();
    }).catch(() => undefined);
    return () => { active = false; };
  }, [requestOfferDistance, selectedAppointment]);

  const handleOfferMapUnavailable = useCallback(() => {
    setOfferRoute((current) => ({ ...current, status: "error", message: "The map could not be displayed. Try calculating the route again.", mapRoute: null }));
  }, []);

  const startTourBlockDayPractice = useCallback(() => {
    const practiceDate = new Date();
    let practiceDateKey = "";
    for (let daysAhead = 2; daysAhead <= 14; daysAhead += 1) {
      practiceDate.setTime(Date.now());
      practiceDate.setDate(practiceDate.getDate() + daysAhead);
      practiceDateKey = appointmentDayKey(practiceDate.toISOString(), timezone);
      const hasAppointment = appointments.some((appointment) => appointmentDayKey(appointment.startsAt, appointment.timezone) === practiceDateKey);
      if (!blockedDates.includes(practiceDateKey) && !hasAppointment) break;
    }
    setAvailabilityModalOpen(false);
    setSelectedBlockDate(null);
    setTourPracticeDate(practiceDateKey);
    setTourBlockPreview(false);
    setCalendarView("month");
    setCalendarMonth(practiceDate);
    setSelectedCalendarDate(practiceDateKey);
  }, [appointments, blockedDates, timezone]);

  const startTourAppointmentDemo = useCallback(() => {
    const demoAppointment = createTourDemoAppointment(timezone);
    setAvailabilityModalOpen(false);
    setSelectedBlockDate(null);
    setTourBlockPreview(false);
    setTourDemoDecision(null);
    setTourDemoAppointment(demoAppointment);
    setSelectedAppointment(null);
    setDeclineTarget(null);
    setDeclineReason("");
    setCalendarView("month");
    setCalendarMonth(new Date(demoAppointment.startsAt));
    setSelectedCalendarDate(appointmentDayKey(demoAppointment.startsAt, demoAppointment.timezone));
  }, [timezone]);

  const finishTourAppointmentDemo = useCallback(() => {
    setAvailabilityModalOpen(false);
    setSelectedBlockDate(null);
    setTourBlockPreview(false);
    setTourDemoDecision(null);
    setTourDemoAppointment(null);
    setSelectedAppointment((current) => current?.id === "tour-demo-appointment" ? null : current);
    setDeclineTarget((current) => current?.id === "tour-demo-appointment" ? null : current);
    setDeclineReason("");
  }, []);

  const returnToTourAvailabilityPractice = useCallback(() => {
    setTourDemoDecision(null);
    setTourDemoAppointment(null);
    setSelectedAppointment((current) => current?.id === "tour-demo-appointment" ? null : current);
    setSelectedBlockDate(null);
    setAvailabilityModalOpen(true);
  }, []);

  const returnToTourBlockDayPractice = useCallback(() => {
    setAvailabilityModalOpen(false);
    setTourDemoDecision(null);
    setTourDemoAppointment(null);
    setSelectedAppointment((current) => current?.id === "tour-demo-appointment" ? null : current);
    setDeclineTarget((current) => current?.id === "tour-demo-appointment" ? null : current);
    setDeclineReason("");
    if (tourPracticeDate) setSelectedBlockDate(tourPracticeDate);
  }, [tourPracticeDate]);

  const returnToTourDemoAppointment = useCallback(() => {
    setDeclineTarget((current) => current?.id === "tour-demo-appointment" ? null : current);
    setDeclineReason("");
    if (tourDemoAppointment) setSelectedAppointment(tourDemoAppointment);
  }, [tourDemoAppointment]);

  const acknowledgeNotification = (notification: PartnerPortalNotification) => {
    markNotificationRead(notification.id);
    setNotificationsOpen(false);
    void fetch("/api/partner-portal/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationId: notification.id }),
    }).catch(() => undefined);
  };

  useEffect(() => {
    const updateViewport = () => {
      const mobile = window.innerWidth <= 660;
      setIsMobileViewport(mobile);
      setDesktopTourEnabled(!mobile);
      if (!mobile) setMobileMoreOpen(false);
    };
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  useEffect(() => {
    let active = true;
    const initializePush = async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window) || !window.isSecureContext) {
        if (active) setPushState("unsupported");
        return;
      }
      try {
        const response = await fetch("/api/partner-portal/push-subscriptions", { cache: "no-store" });
        const config = await response.json();
        if (!active) return;
        if (!response.ok || !config?.ok || !config.configured || !config.publicKey) {
          setPushState("unavailable");
          return;
        }
        setPushPublicKey(String(config.publicKey));
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (!active) return;
        if (subscription) {
          const saved = await fetch("/api/partner-portal/push-subscriptions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(subscription.toJSON()),
          });
          if (!active) return;
          setPushState(saved.ok ? "subscribed" : "error");
          return;
        }
        setPushState(Notification.permission === "denied" ? "denied" : "ready");
      } catch {
        if (active) setPushState("error");
      }
    };
    void initializePush();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const badgeNavigator = navigator as Navigator & { setAppBadge?: (count?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (unreadNotifications > 0) void badgeNavigator.setAppBadge?.(unreadNotifications).catch(() => undefined);
    else void badgeNavigator.clearAppBadge?.().catch(() => undefined);
  }, [unreadNotifications]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (screen !== "appointments" || !appointmentsLoaded || notificationTargetHandledRef.current) return;
    notificationTargetHandledRef.current = true;
    const currentUrl = new URL(window.location.href);
    const appointmentId = currentUrl.searchParams.get("appointment");
    if (!appointmentId) return;
    const targetAppointment = appointments.find((appointment) => appointment.id === appointmentId);
    if (targetAppointment) {
      setSelectedAppointment(targetAppointment);
      setCalendarMonth(new Date(targetAppointment.startsAt));
      setSelectedCalendarDate(appointmentDayKey(targetAppointment.startsAt, targetAppointment.timezone));
    } else {
      setAppointmentError("This appointment is no longer available in your portal.");
    }
    currentUrl.searchParams.delete("appointment");
    currentUrl.searchParams.delete("offer");
    window.history.replaceState(window.history.state, "", `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
  }, [appointments, appointmentsLoaded, screen]);

  useEffect(() => {
    if (!expandedCalendarDate) return;
    const closeOverflow = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && calendarOverflowRef.current?.contains(target)) return;
      setExpandedCalendarDate(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpandedCalendarDate(null);
    };
    document.addEventListener("pointerdown", closeOverflow);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOverflow);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [expandedCalendarDate]);

  useEffect(() => {
    const modalOpen = availabilityModalOpen
      || Boolean(selectedBlockDate)
      || Boolean(selectedAppointment)
      || Boolean(earlyStartTarget)
      || Boolean(declineTarget)
      || Boolean(rescheduleTarget)
      || installHelpOpen
      || mobileMoreOpen
      || (isMobileViewport && notificationsOpen);
    if (!modalOpen) return;
    const previousBodyOverflow = document.body.style.overflow;
    const previousDocumentOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousDocumentOverflow;
    };
  }, [availabilityModalOpen, declineTarget, earlyStartTarget, installHelpOpen, isMobileViewport, mobileMoreOpen, notificationsOpen, rescheduleTarget, selectedAppointment, selectedBlockDate]);

  useEffect(() => {
    if (!installHelpOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setInstallHelpOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [installHelpOpen]);

  useEffect(() => {
    if (!mobileMoreOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMoreOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [mobileMoreOpen]);

  useEffect(() => {
    const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
    const standalone = window.matchMedia("(display-mode: standalone)").matches || navigatorWithStandalone.standalone === true;
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    if (standalone) setPwaInstallState("installed");
    else setPwaInstallState(isIos ? "ios" : "manual");

    if ("serviceWorker" in navigator && window.isSecureContext) {
      void navigator.serviceWorker.register("/partner-sw.js", { scope: "/partner-portal" }).catch(() => {
        // The portal remains fully functional in browsers without service workers.
      });
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
      setPwaInstallState("available");
    };
    const onAppInstalled = () => {
      setInstallPrompt(null);
      setPwaInstallState("installed");
      setInstallNotice("Partner Portal is installed and ready from your home screen.");
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
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
          const nextAppointments = (appointmentsPayload.appointments || []) as PartnerPortalAppointment[];
          setAppointments(nextAppointments);
          setAppointmentsLoaded(true);
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
  }, [notificationReadStorageKey, screen]);

  useEffect(() => {
    if (screen !== "directory") return;
    let active = true;
    setDirectoryLoading(true);
    setDirectoryError("");
    const query = new URLSearchParams({ start: directoryDateRange.startDate, end: directoryDateRange.endDate });
    void fetch(`/api/partner-portal/directory?${query}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Unable to load directory performance.");
        if (active) setDirectoryDashboard(payload.dashboard as DirectoryDashboard);
      })
      .catch((caught) => { if (active) setDirectoryError(caught instanceof Error ? caught.message : "Unable to load directory performance."); })
      .finally(() => { if (active) setDirectoryLoading(false); });
    return () => { active = false; };
  }, [directoryDateRange.endDate, directoryDateRange.startDate, screen]);

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

  async function selectPhoto(file: File | null) {
    if (!file) return;
    setError("");
    if (!(file.type === "image/jpeg" || file.type === "image/png")) {
      setError("Profile photo must be a JPG or PNG image.");
      return;
    }
    try {
      const prepared = await prepareProfilePhoto(file);
      setPhoto(prepared);
      setPreview((current) => {
        if (current.startsWith("blob:")) URL.revokeObjectURL(current);
        return URL.createObjectURL(prepared);
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to prepare this photo.");
    }
  }

  function toggleCredential(credential: string) {
    const selected = credentials.split(",").map((item) => item.trim()).filter(Boolean);
    const next = selected.includes(credential)
      ? selected.filter((item) => item !== credential)
      : [...selected, credential];
    setCredentials(next.join(", "));
  }

  async function persistProfile() {
    setSaving(true);
    setMessage("");
    setError("");
    const body = new FormData();
    body.append("displayName", displayName);
    body.append("businessName", businessName);
    body.append("publicTitle", publicTitle);
    body.append("professionalCredentials", credentials);
    body.append("biography", biography);
    if (photo) body.append("profilePhoto", photo);
    try {
      const response = await fetch("/api/partner-portal/profile", { method: "PATCH", body });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Unable to save your profile.");
      const updatedFields = payload.profile as Partial<PartnerPortalProfile>;
      setProfile((current) => ({ ...current, ...updatedFields }));
      setDisplayName(String(updatedFields.displayName || displayName));
      setBusinessName(String(updatedFields.businessName ?? businessName));
      setPublicTitle(String(updatedFields.publicTitle || publicTitle));
      setCredentials(String(updatedFields.professionalCredentials || credentials));
      setBiography(String(updatedFields.biography || biography));
      if (updatedFields.profilePhotoUrl) setPreview(updatedFields.profilePhotoUrl);
      setPhoto(null);
      setMessage("Your profile was saved successfully.");
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save your profile.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await persistProfile();
  }

  async function signOut() {
    await fetch("/api/public/partner-portal/logout", { method: "POST" });
    window.location.href = "/partner-login";
  }

  async function installApp() {
    setInstallNotice("");
    if (pwaInstallState === "installed") {
      setInstallNotice("The My Drip Nurse app is already installed on this device.");
      return;
    }
    if (!installPrompt) {
      setInstallNotice(pwaInstallState === "ios"
        ? "Install from Safari using Share and Add to Home Screen."
        : "Install from your browser menu if the automatic installer is not available.");
      setMenuOpen(false);
      setInstallHelpOpen(true);
      return;
    }
    setMenuOpen(false);
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setInstallPrompt(null);
      setPwaInstallState("installed");
      setInstallNotice("The My Drip Nurse app was added to your device.");
    } else {
      setInstallNotice("Installation was not completed. You can try again whenever you are ready.");
    }
  }

  async function enablePushNotifications() {
    setPushNotice("");
    if (pushState === "subscribed") {
      setPushNotice("Appointment alerts are already enabled on this device.");
      return;
    }
    if (!pushPublicKey || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setPushNotice("Push notifications are not available on this device yet.");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushState("denied");
        setPushNotice("Notifications are blocked. Enable them in your device settings when you are ready.");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: pushApplicationServerKey(pushPublicKey),
      });
      const response = await fetch("/api/partner-portal/push-subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Unable to enable notifications.");
      setPushState("subscribed");
      setPushNotice("Appointment alerts are enabled on this device.");
    } catch (caught) {
      setPushState("error");
      setPushNotice(caught instanceof Error ? caught.message : "Unable to enable notifications.");
    }
  }

  async function setCatalogServiceStatus(service: PortalCatalogService, status: PortalCatalogService["status"]) {
    setServiceSaving(service.slug);
    setServicesError("");
    try {
      const response = await fetch("/api/partner-portal/services", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceKey: service.slug, status }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Unable to update this service.");
      setCatalogServices(payload.services || []);
      const statusMessage = status === "active"
        ? "available for booking"
        : status === "out_of_stock"
          ? "out of stock; its landing page remains visible, but booking is disabled"
          : "paused and hidden from your Partner website";
      setServiceNotice(`${service.name} is now ${statusMessage}.`);
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
    if (!blockedDate || blockedDate < todayKey || blockedDates.includes(blockedDate)) return;
    setBlockedDates((current) => [...current, blockedDate].sort());
    setBlockedDate("");
  }

  function removeBlockedDate(date: string) {
    setBlockedDates((current) => current.filter((item) => item !== date));
  }

  function openBlockDialog(date: string) {
    if (date < todayKey) return;
    const dayAppointments = appointmentsByDay[date] || [];
    const latestEnd = [...dayAppointments].sort((a, b) => new Date(b.endsAt).getTime() - new Date(a.endsAt).getTime())[0];
    setBlockMode(dayAppointments.length ? "partial" : "full");
    setBlockStartTime(latestEnd ? appointmentClock(latestEnd.endsAt, latestEnd.timezone) : "09:00");
    setBlockEndTime("24:00");
    setSelectedBlockDate(date);
  }

  function selectCalendarDate(date: string) {
    if (date < todayKey) return;
    setExpandedCalendarDate(null);
    setSelectedCalendarDate(date);
    if (!isMobileViewport || partnerTourPhase === "block-day") openBlockDialog(date);
  }

  function shiftCalendarPeriod(direction: number) {
    setExpandedCalendarDate(null);
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
    if (partnerTourPhase === "block-day") {
      setTourBlockPreview(true);
      return;
    }
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
      const readEventTypes = action === "acknowledge"
        ? new Set(["appointment_confirmation", "appointment_reassigned"])
        : new Set([action === "start" ? "start_reminder" : "complete_reminder"]);
      setNotifications((current) => current.map((notification) => (
        notification.appointmentId === appointmentId && readEventTypes.has(notification.eventType)
          ? { ...notification, readAt: notification.readAt || new Date().toISOString() }
          : notification
      )));
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
    if (declineTarget.id === "tour-demo-appointment") {
      setTourDemoDecision("declined");
      return;
    }
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

  const isTourAvailabilityPractice = partnerTourPhase === "availability-setup";
  const isTourBlockPractice = partnerTourPhase === "block-day";
  const blockedDateValue = isTourBlockPractice ? tourPracticeDate : blockedDate;
  const blockedDaysEditor = (
    <div className={styles.blockedDaysCard} id="blocked-days" data-tour-id="appointments-block-day">
      <div>
        <span>Calendar controls</span>
        <h3>Block a day</h3>
        <p>Choose a date and block the full day or only a time window. Existing appointments stay protected.</p>
      </div>
      {isTourBlockPractice ? <p className={styles.tourPracticeNote}><strong>Practice mode</strong> Try the example below. Nothing in this box will be saved to your real calendar.</p> : null}
      <div className={styles.blockedDaysAdd}>
        <label>Date<input type="date" min={todayKey} value={blockedDateValue} onChange={(event) => isTourBlockPractice ? setTourPracticeDate(event.target.value) : setBlockedDate(event.target.value)} /></label>
        <button type="button" onClick={() => isTourBlockPractice ? setTourBlockPreview(true) : addBlockedDate()} disabled={!blockedDateValue}>Add blocked day</button>
      </div>
      {tourBlockPreview || blockedDates.length || blockedRanges.length ? <div className={styles.blockedDaysList} aria-label="Blocked days and hours">
        {tourBlockPreview && tourPracticeDate ? <span className={styles.tourBlockPreview}>{displayBlockedDate(tourPracticeDate)} · Full day <small>Practice</small></span> : null}
        {blockedDates.map((date) => <span key={`full-${date}`}>{displayBlockedDate(date)} · Full day<button type="button" onClick={() => removeBlockedDate(date)} aria-label={`Remove blocked day ${displayBlockedDate(date)}`}>×</button></span>)}
        {blockedRanges.filter((range) => !blockedDates.includes(range.date)).map((range) => <span key={`${range.date}-${range.startTime}-${range.endTime}`}>{displayBlockedDate(range.date)} · {range.startTime}–{range.endTime}<button type="button" onClick={() => setBlockedRanges((current) => current.filter((item) => item !== range))} aria-label={`Remove blocked hours for ${displayBlockedDate(range.date)}`}>×</button></span>)}
      </div> : <small className={styles.noBlockedDays}>No blocked days or hours scheduled.</small>}
      <div className={styles.blockedDaysSave}><button type="button" onClick={() => void saveAvailability()} disabled={availabilitySaving || isTourBlockPractice}>{isTourBlockPractice ? "Practice only · not saved" : availabilitySaving ? "Saving…" : "Save blocked days"}</button></div>
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
          {isTourAvailabilityPractice ? <p className={styles.tourPracticeNote}><strong>Set your schedule now or skip it.</strong> Turn on at least one day and choose your hours, then select Save &amp; continue in the tour. You can also use Skip for now and return here later.</p> : null}
          <div className={styles.scheduleList} data-tour-id="appointments-availability-editor">
            {availability.map((day) => (
              <div className={day.enabled ? styles.scheduleDayActive : styles.scheduleDay} key={day.dayOfWeek}>
                <label className={styles.dayToggle}><input type="checkbox" checked={day.enabled} onChange={(event) => updateAvailabilityDay(day.dayOfWeek, { enabled: event.target.checked })} /><span>{DAY_NAMES[day.dayOfWeek]}</span></label>
                {day.enabled ? <div className={styles.timeRange}><label>From<input type="time" value={day.startTime} onChange={(event) => updateAvailabilityDay(day.dayOfWeek, { startTime: event.target.value })} /></label><span>to</span><label>Until<input type="time" value={day.endTime} onChange={(event) => updateAvailabilityDay(day.dayOfWeek, { endTime: event.target.value })} /></label></div> : <small>Unavailable</small>}
              </div>
            ))}
          </div>
          {!isTourAvailabilityPractice ? blockedDaysEditor : null}
          {availabilityMessage ? <p className={styles.success}>{availabilityMessage}</p> : null}
          {availabilityError ? <p className={styles.error}>{availabilityError}</p> : null}
          {!isTourAvailabilityPractice ? <div className={styles.formActions}><button type="button" onClick={() => void saveAvailability()} disabled={availabilitySaving}>{availabilitySaving ? "Saving…" : "Save availability"}</button></div> : null}
        </div>
      )}
    </>
  );

  const selectedCredentials = credentials.split(",").map((item) => item.trim()).filter(Boolean);
  const existingBiographyAccepted = initialProfile.biography.trim().length > 0;
  const biographyComplete = existingBiographyAccepted
    ? biography.trim().length > 0 && biography.trim().length <= 700
    : biography.trim().length >= 120 && biography.trim().length <= 700;
  const knownCredentialValues = new Set(PROFESSIONAL_CREDENTIAL_OPTIONS.map((option) => option.value));
  const customCredentials = selectedCredentials.filter((credential) => !knownCredentialValues.has(credential));
  const roleOptions = publicTitle && !PROFESSIONAL_ROLE_OPTIONS.includes(publicTitle)
    ? [publicTitle, ...PROFESSIONAL_ROLE_OPTIONS]
    : PROFESSIONAL_ROLE_OPTIONS;

  return (
    <PartnerExperience className={styles.experience}>
      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <Link href="/partner-portal" className={styles.brand} aria-label="My Drip Nurse Partner Portal">
            <span className={styles.brandMark} aria-hidden="true" />
          </Link>
          <nav className={styles.navigation} aria-label="Partner Portal">
            <Link href="/partner-portal" className={screen === "overview" ? styles.active : ""}><span className={styles.navIcon}><PortalIcon name="home" /></span>{t("nav.overview")}</Link>
            <Link href="/partner-portal/appointments" className={screen === "appointments" ? styles.active : ""}><span className={styles.navIcon}><PortalIcon name="calendar" /></span>{t("nav.appointments")}</Link>
            <Link href="/partner-portal/profile" className={screen === "profile" ? styles.active : ""}><span className={styles.navIcon}><PortalIcon name="user" /></span>{t("nav.profile")}</Link>
            <Link href="/partner-portal/website" className={screen === "website" ? styles.active : ""}><span className={styles.navIcon}><PortalIcon name="website" /></span>{t("nav.website")}</Link>
            <Link href="/partner-portal/directory" className={screen === "directory" ? styles.active : ""}><span className={styles.navIcon}><PortalIcon name="directory" /></span>{t("nav.directory")}</Link>
            <Link href="/partner-portal/services" className={screen === "services" ? styles.active : ""}><span className={styles.navIcon}><PortalIcon name="services" /></span>{t("nav.services")}</Link>
            <Link href="/partner-portal/affiliates" className={screen === "affiliates" ? styles.active : ""}><span className={styles.navIcon}><PortalIcon name="affiliates" /></span>{t("nav.affiliates")}</Link>
            <Link href="/partner-portal/rewards" className={screen === "rewards" ? styles.active : ""}><span className={styles.navIcon}><PortalIcon name="rewards" /></span>{t("nav.rewards")}<small>{t("common.comingSoon")}</small></Link>
            <Link href="/partner-portal/products" className={screen === "products" ? styles.active : ""}><span className={styles.navIcon}><PortalIcon name="products" /></span>{t("nav.products")}<small>{t("common.comingSoon")}</small></Link>
            <Link href="/partner-portal/support" className={`${styles.mobileSupportLink} ${screen === "support" ? styles.active : ""}`}><span className={styles.navIcon}><PortalIcon name="support" /></span>{t("nav.support")}</Link>
          </nav>
          <div className={styles.sidebarHelp}>
            <strong>{t("partner.needHelp")}</strong>
            <p>{t("partner.helpCopy")}</p>
            <Link href="/partner-portal/support">{t("partner.contactSupport")} <span aria-hidden="true">→</span></Link>
          </div>
        </aside>

        <main className={styles.main}>
          <header className={styles.topbar}>
            <Link href="/partner-portal" className={styles.mobileTopbarBrand} aria-label="My Drip Nurse Partner Portal">
              <span className={styles.brandMark} aria-hidden="true" />
            </Link>
            <div><small>{t("partner.workspace")}</small><strong>{profile.businessName || profile.displayName}</strong></div>
            <div className={styles.topbarActions} ref={topbarActionsRef}>
              <div className={styles.notificationWrap}>
                <button
                  type="button"
                  className={styles.notificationButton}
                  aria-label={t("partner.notifications")}
                  aria-expanded={notificationsOpen}
                  onClick={() => {
                    setNotificationsOpen((open) => !open);
                    setMenuOpen(false);
                    setMobileMoreOpen(false);
                  }}
                >
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" />
                  </svg>
                  <span className={styles.notificationLabel}>{t("partner.notifications")}</span>
                  {unreadNotifications ? <span className={styles.notificationBadge}>{unreadNotifications > 9 ? "9+" : unreadNotifications}</span> : null}
                </button>
                {notificationsOpen ? (
                  <div className={styles.notificationMenu} role="dialog" aria-label={t("partner.notifications")}>
                    <div className={styles.notificationMenuHeader}>
                      <div><strong>{t("partner.notifications")}</strong><span>{unreadNotifications ? `${unreadNotifications} ${locale === "es" ? "nuevas" : "new"}` : t("partner.upToDate")}</span></div>
                      <button type="button" className={styles.notificationMenuClose} aria-label={locale === "es" ? "Cerrar notificaciones" : "Close notifications"} onClick={() => setNotificationsOpen(false)}>×</button>
                    </div>
                    {notificationsError ? <p className={styles.notificationError}>{notificationsError}</p> : null}
                    {!notificationsError && !unreadNotificationItems.length ? <p className={styles.notificationEmpty}>{t("partner.noNotifications")}</p> : null}
                    {unreadNotificationItems.slice(0, 6).map((notification) => (
                      <a
                        className={`${styles.notificationItem} ${styles.notificationItemUnread}`}
                        key={notification.id}
                        href={notificationDestination(notification)}
                        onClick={() => acknowledgeNotification(notification)}
                        aria-label={`Open notification: ${notification.title}`}
                      >
                        <strong>{notification.title}</strong>
                        <p>{notification.message}</p>
                        <span className={styles.notificationItemMeta}><small>{new Date(notification.createdAt).toLocaleString(displayLocale, { dateStyle: "medium", timeStyle: "short" })}</small><span aria-hidden="true">→</span></span>
                      </a>
                    ))}
                    <Link className={styles.notificationMenuLink} href="/partner-portal/appointments" onClick={() => setNotificationsOpen(false)}>{t("partner.viewAppointments")} <span aria-hidden="true">→</span></Link>
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className={styles.mobileMenuButton}
                aria-label="Open Partner Portal navigation"
                aria-expanded={mobileMoreOpen}
                aria-controls="mobile-navigation-drawer"
                onClick={() => {
                  setMobileMoreOpen(true);
                  setNotificationsOpen(false);
                  setMenuOpen(false);
                }}
              >
                <span aria-hidden="true" /><span aria-hidden="true" /><span aria-hidden="true" />
              </button>
              <div className={styles.accountWrap}>
                <button
                  type="button"
                  className={styles.account}
                  onClick={() => {
                    setMenuOpen((open) => !open);
                    setNotificationsOpen(false);
                    setMobileMoreOpen(false);
                  }}
                  aria-expanded={menuOpen}
                >
                  {profile.profilePhotoUrl ? <img src={profile.profilePhotoUrl} alt={`${profile.displayName} Partner profile`} title={`${profile.displayName} My Drip Nurse Partner profile`} /> : <span>{initials(profile.displayName)}</span>}
                  <div><strong>{profile.displayName}</strong><small>{profile.email}</small></div>
                  <b>⌄</b>
                </button>
                {menuOpen ? (
                  <div className={styles.accountMenu}>
                    <Link href="/partner-portal/profile" onClick={() => setMenuOpen(false)}>{t("menu.editProfile")}</Link>
                    <button type="button" onClick={() => { void installApp(); }}>{pwaInstallState === "installed" ? t("menu.installed") : t("menu.install")}</button>
                    <button type="button" onClick={() => { void enablePushNotifications(); }}>{pushState === "subscribed" ? t("menu.alertsEnabled") : t("menu.enableAlerts")}</button>
                    <PortalLanguageSelector />
                    <button type="button" onClick={() => { setMenuOpen(false); void signOut(); }}>{t("menu.signOut")}</button>
                    {installNotice ? <small className={styles.installNotice}>{installNotice}</small> : null}
                    {pushNotice ? <small className={styles.installNotice}>{pushNotice}</small> : null}
                  </div>
                ) : null}
              </div>
            </div>
          </header>

          <div className={styles.content}>
            {screen === "overview" ? <>
            <section className={styles.welcome} id="overview" data-tour-id="overview-workspace">
              <div><span>Welcome back</span><h1>{profile.displayName}</h1><p>Manage the information patients see and keep your My Drip Nurse presence current.</p></div>
              <span className={`${styles.status} ${styles[profile.websiteStatus]}`}>{profile.websiteStatus}</span>
            </section>

            <div className={styles.partnerDashboardGrid} aria-label="Partner performance dashboard">
              <article className={`${styles.partnerDashboardMetric} ${styles.partnerScoreMetric}`} data-tour-id="overview-kpi-score"><span>Partner score</span><strong>{partnerDashboard.score}<small>/ 100</small></strong><em>{partnerDashboard.scoreLabel}</em><small>Starts at 100 · −10 per declined appointment</small></article>
              <article className={`${styles.partnerDashboardMetric} ${styles.partnerRevenueMetric}`} data-tour-id="overview-kpi-revenue"><span>Revenue generated for you</span><strong>{money(partnerDashboard.completedRevenue, partnerDashboard.currency)}</strong><small>Completed visits · amount to collect at the appointment</small></article>
              <article className={styles.partnerDashboardMetric} data-tour-id="overview-kpi-completed"><span>Completed appointments</span><strong>{partnerDashboard.completedAppointments}</strong><small>Visits successfully completed</small></article>
              <article className={styles.partnerDashboardMetric} data-tour-id="overview-kpi-upcoming"><span>Upcoming appointments</span><strong>{partnerDashboard.upcomingAppointments}</strong><small>Visits on your calendar</small></article>
              <article className={styles.partnerDashboardMetric} data-tour-id="overview-kpi-acceptance"><span>Acceptance rate</span><strong>{partnerDashboard.acceptanceRate}%</strong><small>{partnerDashboard.acceptedAppointments} accepted · {partnerDashboard.declinedAppointments} declined</small></article>
            </div>
            <div className={styles.partnerPerformanceNote}><strong>How your score works</strong><span>Accept appointments you can fulfill and complete each visit. If you cannot attend, decline promptly with a reason so we can reroute the patient. When no coverage exists, the client deposit is refunded automatically.</span></div>

            <div className={styles.summaryGrid}>
              <article><span>Service areas</span><strong>{profile.serviceAreas.length}</strong><small>{profile.serviceAreas.map((area) => area.county).join(", ") || "Pending"}</small></article>
              <article><span>Active services</span><strong>{profile.services.length}</strong><small>Connected through your calendar group</small></article>
              <article><span>Available days</span><strong>{availability.filter((day) => day.enabled).length}</strong><small>Minimum notice: 2 hours</small></article>
              <article><span>Website profile</span><strong>{profile.profilePhotoUrl ? "Ready" : "Review"}</strong><small>Public photo and biography</small></article>
            </div>
            </> : null}

            {screen === "appointments" ? <section className={styles.panel} id="appointments" data-tour-id="appointments-workspace">
              <div className={styles.panelHeading}><div><span>Appointments</span><h2>All patient visits</h2></div><div className={styles.panelHeadingActions}><strong>{appointments.length} total visits</strong><button type="button" className={`${styles.calendarSettingsButton} ${partnerTourPhase === "availability-button" ? styles.calendarSettingsButtonTourTarget : ""}`} data-tour-id="appointments-availability-button" onClick={() => setAvailabilityModalOpen(true)} aria-label="Open availability settings" title="Availability settings"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.09a2 2 0 0 1 1 1.74v.5a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg></button></div></div>
              <div className={styles.calendarToolbar}>
                <button type="button" onClick={() => shiftCalendarPeriod(-1)} aria-label="Previous period">‹</button>
                <strong>{calendarView === "week" ? `${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(weekDays[0].date)} – ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(weekDays[6].date)}` : calendarView === "list" ? "All visits" : monthLabel}</strong>
                <button type="button" onClick={() => shiftCalendarPeriod(1)} aria-label="Next period">›</button>
                <div className={styles.calendarViewSwitcher} role="group" aria-label="Calendar view">
                  {(["month", "week", "list"] as CalendarViewMode[]).map((view) => <button type="button" key={view} className={calendarView === view ? styles.calendarViewActive : ""} onClick={() => { setExpandedCalendarDate(null); setCalendarView(view); }}>{view === "month" ? "Monthly" : view === "week" ? "Weekly" : "List"}</button>)}
                </div>
              </div>
              {calendarView === "month" ? <>
              <div className={styles.calendarWeekdays} aria-hidden="true">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}</div>
              <div className={styles.calendarGrid} role="grid" aria-label={`${monthLabel} appointments`}>
                {calendarCells.map((cell, index) => {
                  const dayAppointments = cell.key ? appointmentsByDay[cell.key] || [] : [];
                  const isBlocked = Boolean(cell.key && blockedDates.includes(cell.key));
                  const isPartiallyBlocked = Boolean(cell.key && blockedRanges.some((range) => range.date === cell.key));
                  const isPast = Boolean(cell.key && cell.key < todayKey);
                  const isSelected = Boolean(cell.key && selectedCalendarDate === cell.key);
                  const isOverflowOpen = Boolean(cell.key && expandedCalendarDate === cell.key);
                  const isRightEdge = index % 7 >= 5;
                  const isBottomEdge = index >= calendarCells.length - 14;
                  const cellClassName = cell.day
                    ? `${styles.calendarCell} ${isPast ? styles.calendarCellPast : styles.calendarCellInteractive} ${isBlocked && !isPast ? styles.calendarCellBlocked : ""} ${isSelected && !isPast ? styles.calendarCellSelected : ""} ${isOverflowOpen ? styles.calendarCellOverflowOpen : ""}`
                    : styles.calendarCellMuted;
                  return <div
                    className={cellClassName}
                    role="gridcell"
                    tabIndex={cell.key && !isPast ? 0 : -1}
                    key={`${cell.key || "empty"}-${index}`}
                    data-tour-id={partnerTourPhase === "block-day" && cell.key === tourPracticeDate ? "appointments-block-day-calendar" : undefined}
                    aria-disabled={isPast || undefined}
                    aria-label={cell.key ? `${displayBlockedDate(cell.key)}${isPast ? ", past date" : isBlocked ? ", blocked" : ", available to block"}` : undefined}
                    onClick={() => cell.key && !isPast && selectCalendarDate(cell.key)}
                    onKeyDown={(event) => {
                      if (cell.key && !isPast && (event.key === "Enter" || event.key === " ")) {
                        event.preventDefault();
                        selectCalendarDate(cell.key);
                      }
                    }}
                  >
                    {cell.day ? <span className={styles.calendarDayNumber}>{cell.day}</span> : null}
                    {!isPast && isBlocked ? <span className={styles.calendarBlockBadge}>Blocked</span> : !isPast && isPartiallyBlocked ? <span className={styles.calendarBlockBadge}>Hours blocked</span> : null}
                    {dayAppointments.length ? <span className={styles.calendarAppointmentDot} aria-label={`${dayAppointments.length} appointment${dayAppointments.length === 1 ? "" : "s"}`} /> : null}
                    <div className={styles.calendarEvents}>
                      {dayAppointments.slice(0, 2).map((appointment) => { const meta = appointmentStatusMeta(appointment.status); const needsAction = isAppointmentOffer(appointment); return <button type="button" className={`${styles.calendarEvent} ${isPast ? styles.calendarEventPast : ""} ${appointmentStatusClass(meta, styles)} ${needsAction ? styles.calendarEventAction : ""}`} data-tour-id={appointment.id === "tour-demo-appointment" ? "appointments-demo-event" : undefined} key={appointment.id} onClick={(event) => { event.stopPropagation(); setSelectedAppointment(appointment); }} title={needsAction ? `New appointment · Action required · ${appointment.serviceName}` : `${appointment.customerName} · ${appointment.serviceName}`}>
                        {needsAction ? <><strong><i aria-hidden="true" /> New appointment</strong><span>{appointmentTime(appointment.startsAt, appointment.timezone)} · Action required</span></> : <><strong>{appointmentTime(appointment.startsAt, appointment.timezone)}</strong><span>{appointment.customerName}</span></>}
                      </button>; })}
                      {dayAppointments.length > 2 ? <button type="button" className={styles.calendarMoreButton} aria-expanded={isOverflowOpen} aria-controls={`calendar-overflow-${cell.key}`} onClick={(event) => { event.stopPropagation(); setExpandedCalendarDate((current) => current === cell.key ? null : cell.key); }}>+{dayAppointments.length - 2} more</button> : null}
                    </div>
                    {isOverflowOpen ? <div ref={calendarOverflowRef} id={`calendar-overflow-${cell.key}`} className={`${styles.calendarOverflowPopover} ${isRightEdge ? styles.calendarOverflowPopoverRight : ""} ${isBottomEdge ? styles.calendarOverflowPopoverUp : ""}`} role="dialog" aria-label={`More appointments on ${displayBlockedDate(cell.key as string)}`} onClick={(event) => event.stopPropagation()}>
                      <div className={styles.calendarOverflowHeader}><div><span>{displayBlockedDate(cell.key as string)}</span><strong>{dayAppointments.length - 2} more visit{dayAppointments.length - 2 === 1 ? "" : "s"}</strong></div><button type="button" onClick={() => setExpandedCalendarDate(null)} aria-label="Close additional appointments">×</button></div>
                      <div className={styles.calendarOverflowList}>{dayAppointments.slice(2).map((appointment) => { const meta = appointmentStatusMeta(appointment.status); return <button type="button" className={`${styles.calendarOverflowAppointment} ${appointmentStatusClass(meta, styles)}`} key={appointment.id} onClick={() => { setExpandedCalendarDate(null); setSelectedAppointment(appointment); }}><span className={styles.calendarOverflowAccent} /><span><strong>{appointment.customerName}</strong><small>{appointment.serviceName}</small></span><time>{appointmentTime(appointment.startsAt, appointment.timezone)}</time></button>; })}</div>
                    </div> : null}
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
                      {(appointmentsByDay[selectedCalendarDate] || []).map((appointment) => { const meta = appointmentStatusMeta(appointment.status); const needsAction = isAppointmentOffer(appointment); return <button type="button" className={`${styles.mobileDayAppointment} ${appointmentStatusClass(meta, styles)} ${needsAction ? styles.mobileDayAppointmentAction : ""}`} data-tour-id={appointment.id === "tour-demo-appointment" ? "appointments-demo-event" : undefined} key={appointment.id} onClick={() => setSelectedAppointment(appointment)}>
                        <span className={styles.mobileDayAppointmentAccent} />
                        <span><strong>{needsAction ? "New appointment" : appointment.customerName}</strong><small>{appointment.serviceName}</small></span>
                        <span className={styles.mobileDayAppointmentTime}>{appointmentTime(appointment.startsAt, appointment.timezone)}<small>{needsAction ? "Action required" : meta.label}</small></span>
                      </button>; })}
                    </div>
                  ) : <div className={styles.mobileDayEmpty}><span>i</span><p>Nothing planned for this day.</p></div>}
                </div>
              ) : null}
              {selectedBlockDate ? (
                <div className={styles.detailBackdrop} role="presentation" onClick={() => { if (partnerTourPhase !== "block-day") setSelectedBlockDate(null); }}>
                  <section className={styles.detailSheet} data-tour-id={partnerTourPhase === "block-day" ? "appointments-block-day-modal" : undefined} role="dialog" aria-modal="true" aria-labelledby="block-day-title" onClick={(event) => event.stopPropagation()}>
                    <div className={styles.detailHeader}>
                      <div><span>Calendar controls</span><h2 id="block-day-title">{displayBlockedDate(selectedBlockDate)}</h2></div>
                      <button type="button" className={styles.closeDetail} onClick={() => setSelectedBlockDate(null)} disabled={partnerTourPhase === "block-day"} aria-label="Close block day dialog">×</button>
                    </div>
                    <p className={styles.blockDialogCopy}>{blockedDates.includes(selectedBlockDate)
                      ? "This day is currently blocked and will not show new booking times."
                      : "Choose a full-day block or close only the remaining hours for this date."}</p>
                    {partnerTourPhase === "block-day" ? <p className={styles.tourPracticeNote}><strong>Practice mode</strong> Explore these options safely. Nothing in this modal will change your real calendar.</p> : null}
                    {(appointmentsByDay[selectedBlockDate] || []).length ? <p className={styles.blockDialogWarning}>Existing appointments remain unchanged. The suggested window starts after the last visit, so the remaining hours are protected without affecting confirmed appointments.</p> : null}
                    {!blockedDates.includes(selectedBlockDate) ? <div className={styles.blockModeGroup} role="radiogroup" aria-label="Block duration">
                      <label className={blockMode === "full" ? styles.blockModeOptionActive : styles.blockModeOption}><input type="radio" name="block-mode" value="full" checked={blockMode === "full"} disabled={partnerTourPhase === "block-day"} onChange={() => setBlockMode("full")} /><span><strong>Full day</strong><small>No new bookings for the entire date.</small></span></label>
                      <label className={blockMode === "partial" ? styles.blockModeOptionActive : styles.blockModeOption}><input type="radio" name="block-mode" value="partial" checked={blockMode === "partial"} disabled={partnerTourPhase === "block-day"} onChange={() => setBlockMode("partial")} /><span><strong>Block hours</strong><small>Keep the rest of the day available.</small></span></label>
                    </div> : null}
                    {!blockedDates.includes(selectedBlockDate) && blockMode === "partial" ? <div className={styles.blockTimeFields}>
                      <label>From<input type="time" value={blockStartTime} disabled={partnerTourPhase === "block-day"} onChange={(event) => setBlockStartTime(event.target.value)} /></label>
                      <span>to</span>
                      <label>Until<select value={blockEndTime} disabled={partnerTourPhase === "block-day"} onChange={(event) => setBlockEndTime(event.target.value)}><option value="24:00">End of day</option>{["12:00", "14:00", "16:00", "18:00", "20:00", "22:00"].map((time) => <option value={time} key={time}>{time}</option>)}</select></label>
                    </div> : null}
                    <div className={styles.blockDialogActions}>
                      <button type="button" className={styles.blockDialogCancel} onClick={() => setSelectedBlockDate(null)} disabled={partnerTourPhase === "block-day"}>Cancel</button>
                      <button type="button" className={styles.blockDialogConfirm} onClick={() => void saveCalendarBlock()} disabled={availabilitySaving || partnerTourPhase === "block-day"}>{partnerTourPhase === "block-day" ? "Tour preview only" : availabilitySaving ? "Saving…" : blockedDates.includes(selectedBlockDate) ? "Unblock this day" : "Block this day"}</button>
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
              <div className={styles.detailBackdrop} role="presentation" onClick={() => { if (!isTourAvailabilityPractice) setAvailabilityModalOpen(false); }}>
                <section className={`${styles.detailSheet} ${styles.availabilityModalSheet}`} data-tour-id={isTourAvailabilityPractice ? "appointments-availability-modal" : undefined} role="dialog" aria-modal="true" aria-labelledby="availability-settings-title" onClick={(event) => event.stopPropagation()}>
                  <div className={styles.detailHeader}>
                    <div><span>Calendar settings</span><h2 id="availability-settings-title">Availability</h2></div>
                    <button type="button" className={styles.closeDetail} onClick={() => setAvailabilityModalOpen(false)} disabled={isTourAvailabilityPractice} aria-label="Close availability settings">×</button>
                  </div>
                  <p className={styles.blockDialogCopy}>Edit the weekly hours and blocked days that patients can book.</p>
                  {availabilityEditor}
                </section>
              </div>
            ) : null}

            {screen === "appointments" && selectedAppointment ? (
              <div className={styles.detailBackdrop} role="presentation" onClick={() => { if (selectedAppointment.id !== "tour-demo-appointment") setSelectedAppointment(null); }}>
                <section className={`${styles.detailSheet} ${isAppointmentOffer(selectedAppointment) ? styles.offerSheet : styles.confirmedAppointmentSheet}`} role="dialog" aria-modal="true" aria-labelledby="appointment-detail-title" onClick={(event) => event.stopPropagation()}>
                  {isAppointmentOffer(selectedAppointment) ? <>
                    <div className={styles.offerHeader}>
                      <div><span className={styles.offerEyebrow}><i aria-hidden="true" /> Action required</span><h2 id="appointment-detail-title">New appointment</h2></div>
                      <button type="button" className={styles.closeDetail} onClick={() => setSelectedAppointment(null)} aria-label="Close appointment offer">×</button>
                    </div>
                    <div className={styles.offerLayout}>
                      <div className={styles.offerEarnings}>
                        <span>Estimated earnings</span>
                        <strong>{money(selectedAppointment.partnerEarnings, selectedAppointment.currency)} <small>+ tips</small></strong>
                        <p>After the booking deposit. Any tip from the patient is added on top.</p>
                      </div>
                      <div className={styles.offerFacts}>
                        <div><span>Service</span><strong>{selectedAppointment.serviceName}</strong></div>
                        <div><span>When</span><strong>{appointmentDate(selectedAppointment.startsAt, selectedAppointment.timezone)}</strong></div>
                        <div><span>Area</span><strong>{offerArea(selectedAppointment)}</strong><small>Exact address is shown after you accept.</small></div>
                        <div><span>Patients</span><strong>{1 + selectedAppointment.additionalPatients.length}</strong></div>
                      </div>
                      {offerRoute.status === "ready" && offerRoute.mapRoute ? <div className={styles.offerMapCard} aria-live="polite">
                        <AppointmentOfferMap accessToken={offerMapToken} route={offerRoute.mapRoute} onUnavailable={handleOfferMapUnavailable} />
                        <button type="button" className={styles.offerRecalculateButton} onClick={() => void requestOfferDistance()}><span aria-hidden="true">↻</span> Recalculate</button>
                        <div className={styles.offerRouteBadge}><strong>{offerRoute.durationMinutes} min</strong><span>{offerRoute.distanceMiles} mi away</span></div>
                      </div> : <div className={styles.offerRoutePrompt} aria-live="polite">
                        <button type="button" disabled={["locating", "loading"].includes(offerRoute.status)} onClick={() => void requestOfferDistance()}>
                          <span className={styles.offerRouteIcon} aria-hidden="true">⌁</span>
                          <span>{["locating", "loading"].includes(offerRoute.status) ? "Calculating route…" : "Calculate route"}<small>{["locating", "loading"].includes(offerRoute.status) ? offerRoute.message : "See the live drive from your location"}</small></span>
                          <b aria-hidden="true">→</b>
                        </button>
                        {offerRoute.status === "error" || offerRoute.status === "unavailable" ? <small>{offerRoute.message}</small> : null}
                      </div>}
                    </div>
                    <p className={styles.offerPrivacy}>Your location is used only to estimate this drive and is not saved with the appointment.</p>
                    <div className={styles.offerActions}>
                      <button type="button" className={styles.offerDeclineButton} onClick={() => { const appointment = selectedAppointment; setSelectedAppointment(null); setDeclineTarget(appointment); setDeclineReason(""); }}>Decline</button>
                      <button type="button" className={styles.offerAcceptButton} onClick={() => { const appointmentId = selectedAppointment.id; setSelectedAppointment(null); void advanceAppointment(appointmentId, "acknowledge"); }}><span><small>Accept and earn</small>{money(selectedAppointment.partnerEarnings, selectedAppointment.currency)} + tips</span><b aria-hidden="true">→</b></button>
                    </div>
                  </> : <>
                  <div className={`${styles.detailHeader} ${styles.confirmedAppointmentHeader}`}>
                    <div className={styles.confirmedServiceIdentity}>
                      {selectedAppointment.serviceImageUrl ? <img className={styles.confirmedServiceImage} src={selectedAppointment.serviceImageUrl} alt={selectedAppointment.serviceImageAlt} /> : <span className={styles.confirmedServiceImageFallback} aria-hidden="true">IV</span>}
                      <div><span>Confirmed appointment</span><h2 id="appointment-detail-title">{selectedAppointment.serviceName}</h2></div>
                    </div>
                    <button type="button" className={styles.closeDetail} onClick={() => setSelectedAppointment(null)} disabled={selectedAppointment.id === "tour-demo-appointment"} aria-label="Close appointment details">×</button>
                  </div>
                  <div className={styles.detailGrid}>
                    <div className={styles.detailTourSummary} data-tour-id={selectedAppointment.id === "tour-demo-appointment" ? "appointments-demo-patient" : undefined}>
                      <div>
                        <small>Primary patient</small>
                        <strong>{selectedAppointment.customerName}</strong>
                        <span>Date of birth · {formatDateOfBirth(selectedAppointment.customerDateOfBirth)}</span>
                        {selectedAppointment.customerBmi !== null ? (
                          <span>{formatPatientMeasurements(selectedAppointment.customerWeight, selectedAppointment.customerHeight, selectedAppointment.customerBmi)}</span>
                        ) : null}
                        <a href={`mailto:${selectedAppointment.customerEmail}`}>{selectedAppointment.customerEmail}</a>
                        <a href={`tel:${selectedAppointment.customerPhone}`}>{selectedAppointment.customerPhone}</a>
                      </div>
                      <div><small>When</small><strong>{appointmentDate(selectedAppointment.startsAt, selectedAppointment.timezone)}</strong><span>{appointmentTimezoneLabel(selectedAppointment.startsAt, selectedAppointment.timezone)}</span><span>{selectedAppointment.timezone}</span></div>
                    </div>
                    {selectedAppointment.additionalPatients.length ? <div className={styles.detailFull}><small>Additional patients</small>{selectedAppointment.additionalPatients.map((patient, index) => <div className={styles.additionalPatientDetail} key={`${patient.email}-${index}`}><strong>{patient.fullName}</strong><span>Date of birth · {formatDateOfBirth(patient.dateOfBirth)}</span><a href={`mailto:${patient.email}`}>{patient.email}</a><a href={`tel:${patient.phone}`}>{patient.phone}</a></div>)}</div> : null}
                    {selectedAppointment.platformFundedReward && ["partner_acknowledged", "in_progress", "completed"].includes(selectedAppointment.status) ? (
                      <div className={`${styles.detailFull} ${styles.platformFundedNotice}`}>
                        <small>My Drip Nurse funded visit</small>
                        <strong>Your normal {money(selectedAppointment.platformFundedAmount, selectedAppointment.currency)} payment is protected.</strong>
                        <span>Do not collect payment from the patient. My Drip Nurse pays this visit after it is completed.</span>
                      </div>
                    ) : null}
                    <div className={styles.detailFull} data-tour-id={selectedAppointment.id === "tour-demo-appointment" ? "appointments-demo-address" : undefined}><small>Service address</small><strong>{appointmentAddress(selectedAppointment) || "Address will be provided before the visit."}</strong>{appointmentAddress(selectedAppointment) ? <div className={styles.mapActions}><a href={mapUrl("google", appointmentAddress(selectedAppointment))} target="_blank" rel="noopener noreferrer">Open in Google Maps ↗</a><a href={mapUrl("apple", appointmentAddress(selectedAppointment))} target="_blank" rel="noopener noreferrer">Open in Apple Maps ↗</a></div> : null}</div>
                    <div><small>Appointment</small><strong>{selectedAppointment.reference}</strong><span>{appointmentStatusMeta(selectedAppointment.status).label}</span></div>
                    <div data-tour-id={selectedAppointment.id === "tour-demo-appointment" ? "appointments-demo-collection" : undefined}>
                      <small>{selectedAppointment.platformFundedReward && ["partner_acknowledged", "in_progress", "completed"].includes(selectedAppointment.status) ? "Payment source" : "Collection"}</small>
                      <strong>{selectedAppointment.platformFundedReward && ["partner_acknowledged", "in_progress", "completed"].includes(selectedAppointment.status) ? "My Drip Nurse" : money(selectedAppointment.amountDueAtVisit, selectedAppointment.currency)}</strong>
                      <span>{selectedAppointment.platformFundedReward && ["partner_acknowledged", "in_progress", "completed"].includes(selectedAppointment.status) ? `${money(selectedAppointment.platformFundedAmount, selectedAppointment.currency)} after completion · collect $0 from patient` : "Amount to collect at the appointment"}</span>
                    </div>
                  </div>
                  <div className={styles.detailDecisionActions} data-tour-id={selectedAppointment.id === "tour-demo-appointment" ? "appointments-demo-decisions" : undefined}>
                    <span className={styles.detailDecisionLabel}>Appointment decision</span>
                    <div className={styles.detailDecisionButtons}>
                      {selectedAppointment.id === "tour-demo-appointment" ? <>
                        <p className={styles.tourDemoNotice}>Practice mode · These buttons do not change a real appointment.</p>
                        <button type="button" className={styles.detailAcceptButton} data-tour-id="appointments-demo-accept" disabled>Accept appointment</button>
                        <button type="button" className={styles.detailDeclineButton} data-tour-id="appointments-demo-decline" disabled>Decline</button>
                        {tourDemoDecision ? <span className={styles.tourDemoResult} role="status">{tourDemoDecision === "accepted" ? "Accepted in practice. A real appointment would move to your confirmed workflow." : "Declined in practice. A real appointment would ask for a reason before it is reassigned."}</span> : null}
                      </> : <>
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
                      {selectedAppointment.status === "partner_acknowledged" ? appointmentIsOutsideStartWindow(selectedAppointment.startsAt, now) ? <>
                        <span className={styles.detailTimingNotice} aria-live="polite">{appointmentCountdown(selectedAppointment.startsAt, now)} · Start visit becomes available 1 hour before the appointment.</span>
                        <button type="button" className={styles.detailEarlyStartButton} onClick={() => { setSelectedAppointment(null); setEarlyStartTarget(selectedAppointment); setEarlyStartReason(""); }}>Start early</button>
                      </> : <><span className={styles.detailStartReady} aria-live="polite">You are within the 1-hour start window.</span><button type="button" className={styles.detailAcceptButton} onClick={() => { const appointmentId = selectedAppointment.id; setSelectedAppointment(null); void advanceAppointment(appointmentId, "start"); }}>Start visit</button></> : null}
                      {selectedAppointment.status === "in_progress" ? <button type="button" className={styles.detailAcceptButton} onClick={() => { const appointmentId = selectedAppointment.id; setSelectedAppointment(null); void advanceAppointment(appointmentId, "complete"); }}>Complete visit</button> : null}
                      {["confirmed", "partner_acknowledged"].includes(selectedAppointment.status) ? <button type="button" className={styles.detailSecondaryButton} onClick={() => openReschedule(selectedAppointment)}>Reschedule appointment</button> : null}
                      {!(["payment_pending", "confirmed", "partner_acknowledged", "in_progress"].includes(selectedAppointment.status)) && selectedAppointment.status !== "completed" ? <span className={styles.detailDecisionSaved}>No action needed for this appointment.</span> : null}
                      </>}
                    </div>
                  </div>
                  </>}
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
              <div className={styles.detailBackdrop} role="presentation" onClick={() => { if (declineTarget.id !== "tour-demo-appointment") setDeclineTarget(null); }}>
                <section className={styles.detailSheet} data-tour-id={declineTarget.id === "tour-demo-appointment" ? "appointments-demo-decline-modal" : undefined} role="dialog" aria-modal="true" aria-labelledby="decline-appointment-title" onClick={(event) => event.stopPropagation()}>
                  <div className={styles.detailHeader}>
                    <div><span>Appointment decision</span><h2 id="decline-appointment-title">Decline this visit?</h2></div>
                    <button type="button" className={styles.closeDetail} onClick={() => setDeclineTarget(null)} disabled={declineTarget.id === "tour-demo-appointment"} aria-label="Close decline dialog">×</button>
                  </div>
                  <p className={styles.blockDialogCopy}>Tell us why you cannot attend. We will first look for another Partner who covers {declineTarget.county}, {declineTarget.state}. If no one is available, the client deposit will be refunded automatically.</p>
                  {declineTarget.id === "tour-demo-appointment" ? <p className={styles.tourPracticeNote}><strong>Tour preview</strong> A reason is required in a real decline. This demonstration cannot be submitted.</p> : null}
                  <label className={styles.declineReasonField}>Reason<textarea value={declineReason} disabled={declineTarget.id === "tour-demo-appointment"} onChange={(event) => setDeclineReason(event.target.value)} rows={5} maxLength={1000} required placeholder="For example: I am unavailable at this time." /></label>
                  <div className={styles.blockDialogActions}>
                    <button type="button" className={styles.blockDialogCancel} onClick={() => setDeclineTarget(null)} disabled={declineTarget.id === "tour-demo-appointment"}>Keep appointment</button>
                    <button type="button" className={styles.blockDialogConfirm} onClick={() => void declineAppointment()} disabled={declineTarget.id === "tour-demo-appointment" || declineSaving || declineReason.trim().length < 3}>{declineTarget.id === "tour-demo-appointment" ? "Tour preview only" : declineSaving ? "Processing…" : "Decline appointment"}</button>
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

            {screen === "availability" ? <section className={styles.panel} id="availability" data-tour-id="availability-workspace">
              <div className={styles.panelHeading}><div><span>Booking calendar</span><h2>Weekly availability</h2></div><p>Patients only see times inside these hours. Every booking requires at least two hours of notice.</p></div>
              {availabilityEditor}
            </section> : null}

            {screen === "profile" ? <section className={`${styles.panel} ${styles.profilePanel}`} id="profile" data-tour-id="profile-workspace">
              <div className={styles.profileHeading} data-tour-id="profile-heading">
                <div><span>Account &amp; profile</span><h2>Your professional profile</h2><p>Keep your personal, business, and professional details accurate in one place.</p></div>
                <div className={styles.profileStatus}><span aria-hidden="true">✓</span><div><strong>Partner profile</strong><small>{profile.websiteStatus === "published" ? "Active and visible" : "Active in your workspace"}</small></div></div>
              </div>
              <form onSubmit={saveProfile} className={styles.form}>
                <div className={styles.profileIdentity} data-tour-id="profile-photo-upload">
                  <div className={styles.photoFrame}>{preview ? <img src={preview} alt="Partner profile preview" title={`${displayName} Partner profile preview`} /> : <span>{initials(displayName)}</span>}</div>
                  <div className={styles.profileIdentityCopy}><span>Public profile photo</span><strong>{displayName || "Your name"}</strong><p>This photo appears in the My Drip Nurse directory and on your Partner website.</p><label className={styles.photoButton}><input type="file" accept="image/jpeg,image/png" onChange={(event) => void selectPhoto(event.target.files?.[0] || null)} />{photo ? "Photo selected ✓" : preview ? "Change photo" : "Choose photo"}</label><small>{preview ? "Photo requirement complete ✓" : "JPG or PNG · Maximum 5 MB"}</small></div>
                </div>
                <div className={styles.profileSection} data-tour-id="profile-personal">
                  <div className={styles.profileSectionHeading}><div><span>01</span><div><strong>Personal information</strong><p>Your account identity and contact email.</p></div></div></div>
                  <div className={styles.fields}>
                    <label>Full name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} minLength={2} maxLength={100} autoComplete="name" required /></label>
                    <label>Email address <span>Login email</span><input value={profile.email} readOnly aria-readonly="true" className={styles.readOnlyField} /></label>
                    <p className={`${styles.fieldHelp} ${styles.full}`}>For security, contact Partner Support if you need to change your login email.</p>
                  </div>
                </div>
                <div className={styles.profileSection} data-tour-id="profile-business">
                  <div className={styles.profileSectionHeading}><div><span>02</span><div><strong>Business information</strong><p>How your practice is identified throughout the portal.</p></div></div></div>
                  <div className={styles.fields}>
                    <label className={styles.full}>Business or practice name <span>Optional</span><input value={businessName} onChange={(event) => setBusinessName(event.target.value)} maxLength={120} autoComplete="organization" placeholder="Your business or practice name" /></label>
                  </div>
                </div>
                <div className={styles.profileSection} data-tour-id="profile-professional">
                  <div className={styles.profileSectionHeading}><div><span>03</span><div><strong>Professional details</strong><p>Help patients understand your licensed role, qualifications, and approach to care.</p></div></div><span className={styles.websiteSyncBadge}>Public information</span></div>
                  <div className={styles.fields}>
                    <label data-tour-id="profile-role">Professional role<select value={publicTitle} onChange={(event) => setPublicTitle(event.target.value)} required><option value="" disabled>Select your primary role</option>{roleOptions.map((role) => <option value={role} key={role}>{role}</option>)}</select></label>
                    <div className={styles.credentialField} data-tour-id="profile-credentials">
                      <div className={styles.credentialLabel}><strong>Licenses &amp; credentials</strong><span>Select all that apply</span></div>
                      <div className={styles.credentialPicker}>
                        {PROFESSIONAL_CREDENTIAL_OPTIONS.map((option) => {
                          const checked = selectedCredentials.includes(option.value);
                          return <label className={checked ? styles.credentialOptionSelected : styles.credentialOption} key={option.value}><input type="checkbox" checked={checked} onChange={() => toggleCredential(option.value)} /><span><b>{option.label}</b><small>{option.description}</small></span></label>;
                        })}
                      </div>
                      {customCredentials.length ? <p className={styles.customCredentials}>Previously saved: {customCredentials.join(", ")}</p> : null}
                    </div>
                    <label className={styles.full} data-tour-id="profile-biography">Professional biography <span>{biography.length}/700</span><textarea value={biography} onChange={(event) => setBiography(event.target.value)} minLength={existingBiographyAccepted ? 1 : 120} maxLength={700} rows={7} required placeholder="Describe your clinical experience, approach to care, and what patients can expect when booking with you." /><small className={styles.biographyRequirement}>{biographyComplete ? "Biography requirement complete ✓" : `${Math.max(0, 120 - biography.trim().length)} more characters required`}</small></label>
                  </div>
                </div>
                <div className={styles.profileFootnote} data-tour-id="profile-website-sync">
                  <div><span className={styles.profileFootnoteIcon} aria-hidden="true">↗</span><div><strong>Connected to your Partner website</strong><p>Your photo and professional details automatically keep your website profile consistent after you save.</p></div></div>
                  <Link href="/partner-portal/website">Review website</Link>
                </div>
                {message ? <p className={styles.success}>{message}</p> : null}
                {error ? <p className={styles.error}>{error}</p> : null}
                <div className={`${styles.formActions} ${styles.profileActions}`} data-tour-id="profile-actions"><p>Your changes stay private until you select save.</p><button type="submit" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button></div>
              </form>
            </section> : null}

            {screen === "website" ? <section className={styles.panel} id="website" data-tour-id="website-workspace">
              <div className={styles.panelHeading}><div><span>Partner website</span><h2>Your reserved page</h2></div><span className={`${styles.status} ${styles[profile.websiteStatus]}`}>{profile.websiteStatus}</span></div>
              <div className={styles.websiteRow} data-tour-id="website-public-url"><div><small>Public URL</small><strong>{websiteUrl.replace("https://", "")}</strong><p>{profile.websiteStatus === "published" ? "Your Partner website is live and ready to share." : "Review the private preview while My Drip Nurse completes its final website review."}</p></div><div className={styles.websiteRowActions}><a className={styles.websitePreviewLink} href={websitePreviewUrl} target="_blank" rel="noopener noreferrer">Open preview ↗</a>{profile.websiteStatus === "published" ? <a href={websiteUrl} target="_blank" rel="noopener noreferrer">View live website ↗</a> : <span className={styles.previewPending}>Admin review pending</span>}</div></div>
              <div className={styles.websitePreviewCard}>
                <div className={styles.websitePreviewHeader}>
                  <div><span>Private home preview</span><h3>See how patients will experience your Partner page.</h3></div>
                  <span className={styles.websitePreviewBadge}>Mobile-first</span>
                </div>
                <div className={styles.websitePreviewBrowser} data-tour-id="website-preview-browser">
                  <div className={styles.websitePreviewChrome} aria-hidden="true"><span /><span /><span /><small>{websiteUrl.replace("https://", "")}</small></div>
                  <iframe src={websitePreviewUrl} title={`${profile.displayName} Partner website preview`} loading="lazy" />
                </div>
                <p className={styles.websitePreviewNote}>This preview uses your current profile photo, biography, service areas, and active services. Changes appear here automatically after they are saved.</p>
              </div>
            </section> : null}

            {screen === "directory" ? <section className={`${styles.panel} ${styles.directoryDashboard}`} id="directory">
              <div className={styles.directoryHero}>
                <div><span>Your public presence</span><h2>Directory performance</h2><p>See how patients discover your profile and move toward booking with you. These results belong only to your Partner profile.</p></div>
                <div className={styles.directoryHeroActions}><a href="https://partners.mydripnurse.com" target="_blank" rel="noreferrer">Open directory ↗</a><a href={websiteUrl} target="_blank" rel="noreferrer">View my profile ↗</a></div>
              </div>
              {directoryLoading && !directoryDashboard ? <p className={styles.schedulePlaceholder}>Loading your directory results…</p> : null}
              {directoryError ? <p className={styles.error}>{directoryError}</p> : null}
              {directoryDashboard ? <>
                <div className={styles.directoryRangeBar} aria-label="Directory analytics date range">
                  <div className={styles.directoryRangePresets}>
                    {(["7d", "30d", "90d", "12m", "custom"] as DirectoryRangePreset[]).map((preset) => <button type="button" className={directoryRangePreset === preset ? styles.directoryRangeActive : ""} onClick={() => selectDirectoryRange(preset)} key={preset}>{preset === "7d" ? "Last 7 days" : preset === "30d" ? "Last 30 days" : preset === "90d" ? "Last 90 days" : preset === "12m" ? "Last 12 months" : "Custom"}</button>)}
                  </div>
                  <span>{directoryRangeLabel(directoryDashboard.range)}</span>
                </div>
                {directoryRangePreset === "custom" ? <div className={styles.directoryCustomRange}>
                  <label><span>Start date</span><input type="date" value={directoryCustomDraft.startDate} max={directoryCustomDraft.endDate || directoryDateOffset(0)} onChange={(event) => setDirectoryCustomDraft((current) => ({ ...current, startDate: event.target.value }))} /></label>
                  <label><span>End date</span><input type="date" value={directoryCustomDraft.endDate} min={directoryCustomDraft.startDate} max={directoryDateOffset(0)} onChange={(event) => setDirectoryCustomDraft((current) => ({ ...current, endDate: event.target.value }))} /></label>
                  <button type="button" onClick={applyDirectoryCustomRange}>Apply dates</button>
                </div> : null}
                <div className={styles.directoryMetrics} aria-label="Directory performance summary">
                  {(Object.keys(DIRECTORY_METRICS) as DirectoryMetricKey[]).map((metric) => {
                    const active = activeDirectoryMetrics.includes(metric);
                    const value = directoryDashboard.metrics[metric];
                    return <button type="button" className={`${styles.directoryMetricCard} ${active ? styles.directoryMetricActive : ""}`} style={{ "--metric-color": DIRECTORY_METRICS[metric].color } as CSSProperties} aria-pressed={active} onClick={() => toggleDirectoryMetric(metric)} key={metric}>
                      <small>{DIRECTORY_METRICS[metric].label}</small><strong>{value.toLocaleString()}</strong>
                      <span>{metric === "impressions" ? "Times your profile appeared" : metric === "profileClicks" ? `${directoryDashboard.metrics.clickThroughRate}% click-through rate` : metric === "bookingClicks" ? "Patients who opened booking" : `${directoryDashboard.metrics.bookingConversionRate}% of booking starts · Directory attributed`}</span>
                      <i aria-hidden="true" />
                    </button>;
                  })}
                </div>
                <article className={styles.directoryChartCard}>
                  <div className={styles.directoryChartHeading}><div><span>{directoryDashboard.range.days.toLocaleString()} day{directoryDashboard.range.days === 1 ? "" : "s"}</span><h3>Patient discovery activity</h3><p>Select the metric cards above to compare performance. Each active line uses its own scale so smaller conversion signals remain visible.</p></div><div className={styles.directoryChartSeries}>{directoryChartModel.series.map((series) => <span key={series.key}><i style={{ background: series.color }} />{series.label}</span>)}</div></div>
                  <div className={styles.directoryChart} aria-label={`Directory performance from ${directoryDashboard.range.startDate} through ${directoryDashboard.range.endDate}`}>
                    <svg viewBox={`0 0 ${directoryChartModel.width} ${directoryChartModel.height}`} role="img" preserveAspectRatio="none">
                      {[0, .25, .5, .75, 1].map((position) => <line className={styles.directoryGridLine} x1="0" x2={directoryChartModel.width} y1={directoryChartModel.top + (directoryChartModel.height - directoryChartModel.top - directoryChartModel.bottom) * position} y2={directoryChartModel.top + (directoryChartModel.height - directoryChartModel.top - directoryChartModel.bottom) * position} key={position} />)}
                      {directoryChartModel.series.map((series) => <g key={series.key}>
                        <path className={styles.directorySeriesLine} d={series.path} stroke={series.color} />
                        {series.points.map((point) => point.value || directoryChartModel.trend.length <= 31 ? <circle className={styles.directorySeriesPoint} cx={point.x} cy={point.y} r="4" fill={series.color} key={`${series.key}-${point.date}`}><title>{`${point.date} · ${series.label}: ${point.value.toLocaleString()}`}</title></circle> : null)}
                      </g>)}
                    </svg>
                    <div className={styles.directoryXAxis}>{directoryChartModel.labelIndexes.map((index) => <span style={{ left: `${directoryChartModel.trend.length <= 1 ? 50 : (index / (directoryChartModel.trend.length - 1)) * 100}%` }} key={directoryChartModel.trend[index].date}>{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(`${directoryChartModel.trend[index].date}T00:00:00`))}</span>)}</div>
                  </div>
                </article>
                <div className={styles.directoryLowerGrid}>
                  <article className={styles.directoryRankingCard}><span>Organic readiness</span><h3>What supports your visibility</h3><ul>
                    <li><b>Directory status</b><small>{profile.directoryStatus === "published" ? "Your profile is visible to patients." : "Your profile is currently hidden. Contact support if this is unexpected."}</small></li>
                    <li><b>Availability</b><small>{directoryDashboard.readiness.availabilityConfigured ? "Your schedule is configured for booking." : "Add availability so patients can find bookable times."}</small></li>
                    <li><b>Acceptance rate</b><small>{directoryDashboard.readiness.acceptanceRate}% based on appointment decisions.</small></li>
                    <li><b>Completed care</b><small>{directoryDashboard.readiness.completedAppointments} completed appointment{directoryDashboard.readiness.completedAppointments === 1 ? "" : "s"} supporting your profile.</small></li>
                  </ul></article>
                  <article className={styles.directoryPromotionCard}><span>Coming next</span><h3>Promote your profile</h3><p>Optional promoted placement will eventually help qualified Partners increase visibility while keeping organic recommendations relevant to each patient’s location.</p><button type="button" disabled>Promotion tools coming soon</button></article>
                </div>
              </> : null}
            </section> : null}

            {screen === "services" ? <section className={styles.panel} id="services" data-tour-id="services-workspace">
              <div className={styles.panelHeading}><div><span>Services</span><h2>Your service catalog</h2></div><strong>{catalogServices.filter((service) => service.active).length} of {catalogServices.length} active</strong></div>
              <p className={styles.catalogIntro}>Pause removes a service from your Partner website. Out of Stock keeps its landing page visible, but disables booking and calendar availability until you restock it.</p>
              {servicesLoading ? <p className={styles.schedulePlaceholder}>Loading your service catalog…</p> : null}
              {servicesError ? <p className={styles.error}>{servicesError}</p> : null}
              {serviceNotice ? <p className={styles.success}>{serviceNotice}</p> : null}
              {!servicesLoading && !catalogServices.length ? <p className={styles.emptyAppointments}>Your service catalog is being prepared by the My Drip Nurse team.</p> : null}
              <div className={styles.partnerCatalogGrid}>
                {catalogServices.map((service, serviceIndex) => {
                  const deposit = serviceDepositAmount(service);
                  const earnings = servicePartnerEarnings(service);
                  const stateLabel = service.active ? "Offered" : service.outOfStock ? "Out of stock" : "Paused";
                  const isServiceTourPreview = serviceIndex === 0 && partnerTourPhase === "service-walkthrough";
                  return <article className={`${styles.partnerCatalogCard} ${service.active ? styles.partnerCatalogCardActive : ""} ${service.outOfStock ? styles.partnerCatalogCardOutOfStock : ""} ${isServiceTourPreview ? styles.partnerCatalogCardTourPreview : ""}`} data-tour-id={serviceIndex === 0 ? "services-featured-service" : undefined} key={service.id}>
                    <div className={styles.partnerCatalogMedia}>
                      {service.imageUrl ? <img src={service.imageUrl} alt={`${service.name} IV therapy`} title={`${service.name} mobile IV therapy`} loading="lazy" /> : <span>{initials(service.name)}</span>}
                      <span className={`${styles.partnerCatalogState} ${service.active ? styles.partnerCatalogStateActive : service.outOfStock ? styles.partnerCatalogStateOutOfStock : styles.partnerCatalogStatePaused}`}>{stateLabel}</span>
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
                      {service.status === "paused" ? (
                        <button type="button" className={styles.partnerCatalogOffer} onClick={() => void setCatalogServiceStatus(service, "active")} disabled={serviceSaving === service.slug}>{serviceSaving === service.slug ? "Updating…" : "Offer this service"}</button>
                      ) : (
                        <div className={styles.partnerCatalogActions}>
                          <button type="button" className={styles.partnerCatalogPause} data-tour-id={serviceIndex === 0 ? "services-featured-pause" : undefined} onClick={() => void setCatalogServiceStatus(service, "paused")} disabled={serviceSaving === service.slug || isServiceTourPreview}>Pause this service</button>
                          <button type="button" className={service.outOfStock ? styles.partnerCatalogRestock : styles.partnerCatalogOutOfStock} data-tour-id={serviceIndex === 0 ? "services-featured-stock" : undefined} onClick={() => void setCatalogServiceStatus(service, service.outOfStock ? "active" : "out_of_stock")} disabled={serviceSaving === service.slug || isServiceTourPreview}>{serviceSaving === service.slug ? "Updating…" : service.outOfStock ? "Back in Stock" : "Out of Stock"}</button>
                        </div>
                      )}
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
              <div className={styles.panelHeading}><div><span>Affiliate center</span><h2>Your referral earnings</h2></div><span className={styles.affiliateRateBadge}>{affiliateDisplayDashboard?.commissionRate ?? 3}% commission</span></div>
              {partnerTourPhase === "affiliate-walkthrough" ? <p className={styles.affiliateTourNotice}><strong>Tour preview</strong> Alex Rivera and DEMO-AFF-001 are examples only. They do not affect your real earnings.</p> : null}
              {affiliateLoading && !affiliateDisplayDashboard ? <p className={styles.schedulePlaceholder}>Loading your referral activity…</p> : null}
              {affiliateError && partnerTourPhase !== "affiliate-walkthrough" ? <p className={styles.error}>{affiliateError}</p> : null}
              {affiliateDisplayDashboard ? <>
                <div className={styles.affiliateHero}>
                  <div><span>Share your Partner page</span><h3>Invite qualified healthcare professionals.</h3><p>Every confirmed appointment generated by a Partner you refer is tracked here automatically.</p></div>
                  <div className={styles.affiliateLink} data-tour-id="affiliate-referral-link"><small>Your referral link</small><strong>{affiliateDisplayDashboard.affiliateUrl.replace("https://", "")}</strong><button type="button" onClick={() => void navigator.clipboard.writeText(affiliateDisplayDashboard.affiliateUrl)}>Copy link</button></div>
                </div>
                <div className={styles.affiliateKpis} aria-label="Affiliate earnings summary" data-tour-id="affiliate-kpis">
                  <article className={styles.affiliateMetric}><small>Total earned</small><strong>{money(affiliateDisplayDashboard.metrics.totalEarned, "USD")}</strong><span>All attributed appointments</span></article>
                  <article className={styles.affiliateMetric}><small>Pending</small><strong>{money(affiliateDisplayDashboard.metrics.pending, "USD")}</strong><span>Awaiting approval or payout</span></article>
                  <article className={styles.affiliateMetric}><small>Paid</small><strong>{money(affiliateDisplayDashboard.metrics.paid, "USD")}</strong><span>Completed payouts</span></article>
                  <article className={styles.affiliateMetric}><small>Referred partners</small><strong>{affiliateDisplayDashboard.metrics.referredPartners}</strong><span>{affiliateDisplayDashboard.metrics.appointments} attributed appointments</span></article>
                </div>
                <div className={styles.affiliateSection}><div className={styles.affiliateSectionHeading}><div><span>Your network</span><h3>Partners you referred</h3></div><small>{affiliateDisplayDashboard.metrics.referredPartners} total</small></div>
                  {affiliateDisplayDashboard.referredPartners.length ? <div className={styles.affiliatePartnerList}>{affiliateDisplayDashboard.referredPartners.map((partner) => <article className={`${styles.affiliatePartnerCard} ${partner.id === TOUR_AFFILIATE_PARTNER_ID ? styles.affiliateDemoRow : ""}`} key={partner.id} data-tour-id={partner.id === TOUR_AFFILIATE_PARTNER_ID ? "affiliate-demo-partner" : undefined}><div className={styles.affiliatePartnerIdentity}><span>{initials(partner.displayName)}</span><div><strong>{partner.displayName}{partner.id === TOUR_AFFILIATE_PARTNER_ID ? <em className={styles.affiliateDemoBadge}>Demo</em> : null}</strong><small>{partner.businessName || "My Drip Nurse Partner"}</small></div></div><div><small>Appointments</small><strong>{partner.appointmentCount}</strong></div><div><small>Earned</small><strong>{money(partner.totalEarned, "USD")}</strong></div><span className={`${styles.status} ${styles[partner.websiteStatus]}`}>{partner.websiteStatus}</span></article>)}</div> : <p className={styles.emptyAppointments}>Partners who join through your referral page will appear here.</p>}
                </div>
                <div className={styles.affiliateSection}><div className={styles.affiliateSectionHeading}><div><span>Commission activity</span><h3>Recent attributed appointments</h3></div><small>3% default · profile overrides apply</small></div>
                  {affiliateDisplayDashboard.commissions.length ? <div className={styles.affiliateCommissionList}>{affiliateDisplayDashboard.commissions.map((item) => <article className={`${styles.affiliateCommissionRow} ${item.id === TOUR_AFFILIATE_COMMISSION_ID ? styles.affiliateDemoRow : ""}`} key={item.id} data-tour-id={item.id === TOUR_AFFILIATE_COMMISSION_ID ? "affiliate-demo-commission" : undefined}><div><strong>{item.serviceName}{item.id === TOUR_AFFILIATE_COMMISSION_ID ? <em className={styles.affiliateDemoBadge}>Demo</em> : null}</strong><small>{item.partnerName} · {item.reference}</small></div><div><strong>{money(item.amount, item.currency)}</strong><small>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(item.appointmentAt))} · {item.rate}%</small></div><span className={styles.affiliateCommissionStatus}>{item.status.replaceAll("_", " ")}</span></article>)}</div> : <p className={styles.emptyAppointments}>No attributed appointments yet. Your first referral will be tracked after the appointment is confirmed.</p>}
                </div>
              </> : null}
            </section> : null}

            {screen === "support" ? <section className={`${styles.panel} ${styles.supportWorkspace}`} id="support" data-tour-id="support-workspace">
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

            {screen === "rewards" ? <ComingSoonFeature feature="rewards" /> : null}
            {screen === "products" ? <ComingSoonFeature feature="products" /> : null}
          </div>
          {mobileMoreOpen ? (
            <div className={styles.mobileMoreBackdrop} role="presentation" onClick={() => setMobileMoreOpen(false)}>
              <section id="mobile-navigation-drawer" className={styles.mobileMoreSheet} role="dialog" aria-modal="true" aria-labelledby="mobile-menu-title" onClick={(event) => event.stopPropagation()}>
                <header>
                  <Link href="/partner-portal/profile" className={styles.mobileDrawerProfile} onClick={() => setMobileMoreOpen(false)}>
                    {profile.profilePhotoUrl ? <img src={profile.profilePhotoUrl} alt="" /> : <span>{initials(profile.displayName)}</span>}
                    <div><small>Partner account</small><strong id="mobile-menu-title">{profile.displayName}</strong><p>{profile.businessName || profile.email}</p></div>
                  </Link>
                  <button type="button" onClick={() => setMobileMoreOpen(false)} aria-label="Close navigation menu">×</button>
                </header>
                <nav aria-label="Partner Portal mobile navigation">
                  <Link href="/partner-portal" className={screen === "overview" ? styles.mobileDrawerActive : ""} onClick={() => setMobileMoreOpen(false)}><span><PortalIcon name="home" /></span><div><strong>{t("nav.overview")}</strong><small>Your activity at a glance</small></div><b>→</b></Link>
                  <Link href="/partner-portal/appointments" className={screen === "appointments" ? styles.mobileDrawerActive : ""} onClick={() => setMobileMoreOpen(false)}><span><PortalIcon name="calendar" /></span><div><strong>{t("nav.appointments")}</strong><small>Review and manage patient visits</small></div><b>→</b></Link>
                  <Link href="/partner-portal/profile" className={screen === "profile" ? styles.mobileDrawerActive : ""} onClick={() => setMobileMoreOpen(false)}><span><PortalIcon name="user" /></span><div><strong>{t("nav.profile")}</strong><small>Keep your professional profile current</small></div><b>→</b></Link>
                  <Link href="/partner-portal/website" className={screen === "website" ? styles.mobileDrawerActive : ""} onClick={() => setMobileMoreOpen(false)}><span><PortalIcon name="website" /></span><div><strong>{t("nav.website")}</strong><small>Preview your Partner website</small></div><b>→</b></Link>
                  <Link href="/partner-portal/directory" className={screen === "directory" ? styles.mobileDrawerActive : ""} onClick={() => setMobileMoreOpen(false)}><span><PortalIcon name="directory" /></span><div><strong>{t("nav.directory")}</strong><small>Review your discovery and booking results</small></div><b>→</b></Link>
                  <Link href="/partner-portal/services" className={screen === "services" ? styles.mobileDrawerActive : ""} onClick={() => setMobileMoreOpen(false)}><span><PortalIcon name="services" /></span><div><strong>{t("nav.services")}</strong><small>Manage what patients can book</small></div><b>→</b></Link>
                  <Link href="/partner-portal/affiliates" className={screen === "affiliates" ? styles.mobileDrawerActive : ""} onClick={() => setMobileMoreOpen(false)}><span><PortalIcon name="affiliates" /></span><div><strong>{t("nav.affiliates")}</strong><small>Track referrals and commissions</small></div><b>→</b></Link>
                  <Link href="/partner-portal/rewards" className={screen === "rewards" ? styles.mobileDrawerActive : ""} onClick={() => setMobileMoreOpen(false)}><span><PortalIcon name="rewards" /></span><div><strong>{t("nav.rewards")}</strong><small>{t("common.comingSoon")}</small></div><b>→</b></Link>
                  <Link href="/partner-portal/products" className={screen === "products" ? styles.mobileDrawerActive : ""} onClick={() => setMobileMoreOpen(false)}><span><PortalIcon name="products" /></span><div><strong>{t("nav.products")}</strong><small>{t("common.comingSoon")}</small></div><b>→</b></Link>
                  <Link href="/partner-portal/support" className={screen === "support" ? styles.mobileDrawerActive : ""} onClick={() => setMobileMoreOpen(false)}><span><PortalIcon name="support" /></span><div><strong>{t("nav.support")}</strong><small>Get help from our Partner team</small></div><b>→</b></Link>
                </nav>
                <footer className={styles.mobileDrawerUtilities}>
                  <button type="button" onClick={() => { setMobileMoreOpen(false); void installApp(); }}>{pwaInstallState === "installed" ? t("menu.installed") : t("menu.install")}</button>
                  <button type="button" onClick={() => { setMobileMoreOpen(false); void enablePushNotifications(); }}>{pushState === "subscribed" ? t("menu.alertsEnabled") : t("menu.enableAlerts")}</button>
                  <PortalLanguageSelector />
                  <button type="button" className={styles.mobileDrawerSignOut} onClick={() => { setMobileMoreOpen(false); void signOut(); }}>{t("menu.signOut")}</button>
                </footer>
              </section>
            </div>
          ) : null}
        </main>
      </div>
      {desktopTourEnabled ? <PartnerOnboardingTour
        applicationId={profile.applicationId}
        partnerName={profile.displayName}
        screen={screen}
        installState={pwaInstallState}
        installNotice={installNotice}
        onInstall={installApp}
        pushState={pushState}
        pushNotice={pushNotice}
        onEnablePush={enablePushNotifications}
        availabilityModalOpen={availabilityModalOpen}
        availabilityConfigured={availability.some((day) => day.enabled)}
        availabilityLoading={availabilityLoading}
        availabilitySaving={availabilitySaving}
        onSaveAvailability={() => saveAvailability()}
        blockDayModalOpen={Boolean(selectedBlockDate)}
        demoAppointmentOpen={selectedAppointment?.id === "tour-demo-appointment"}
        demoAppointmentAvailable={Boolean(tourDemoAppointment)}
        declineModalOpen={declineTarget?.id === "tour-demo-appointment"}
        onTourPhaseChange={setPartnerTourPhase}
        onStartBlockDayPractice={startTourBlockDayPractice}
        onStartAppointmentDemo={startTourAppointmentDemo}
        onFinishAppointmentDemo={finishTourAppointmentDemo}
        onReturnToAvailabilityPractice={returnToTourAvailabilityPractice}
        onReturnToBlockDayPractice={returnToTourBlockDayPractice}
        onReturnToDemoAppointment={returnToTourDemoAppointment}
        profilePhotoSelected={Boolean(photo || preview || profile.profilePhotoUrl)}
        profileRoleComplete={publicTitle.trim().length >= 2}
        profileCredentialsComplete={selectedCredentials.length > 0}
        profileBiographyComplete={biographyComplete}
        profileSaving={saving}
        onSaveProfile={persistProfile}
        initiallyCompleted={profile.portalTourCompleted}
        initiallyRequired={profile.portalTourRequired}
      /> : null}
      {installHelpOpen ? (
        <div className={styles.installHelpBackdrop} role="presentation" onClick={() => setInstallHelpOpen(false)}>
          <section className={styles.installHelpDialog} role="dialog" aria-modal="true" aria-labelledby="install-app-title" onClick={(event) => event.stopPropagation()}>
            <button type="button" className={styles.installHelpClose} onClick={() => setInstallHelpOpen(false)} aria-label="Close installation instructions">×</button>
            <span className={styles.installHelpEyebrow}>My Drip Nurse App</span>
            <h2 id="install-app-title">Install the Partner app.</h2>
            {pwaInstallState === "ios" ? (
              <ol className={styles.installHelpSteps}>
                <li><strong>Open this portal in Safari.</strong><span>Installation is managed by Safari on iPhone and iPad.</span></li>
                <li><strong>Tap the Share button.</strong><span>It is the square icon with an upward arrow.</span></li>
                <li><strong>Select Add to Home Screen.</strong><span>Keep Open as Web App enabled, then tap Add.</span></li>
              </ol>
            ) : (
              <div className={styles.installHelpOptions}>
                <div><strong>Chrome or Edge</strong><span>Open the browser menu and select Install My Drip Nurse Partner Portal or Install app.</span></div>
                <div><strong>Safari on Mac</strong><span>Open the File menu and select Add to Dock.</span></div>
              </div>
            )}
            <p className={styles.installHelpNote}>After installation, open the app and choose <strong>Enable appointment alerts</strong> to test push notifications on this device.</p>
            <button type="button" className={styles.installHelpDone} onClick={() => setInstallHelpOpen(false)}>Got it</button>
          </section>
        </div>
      ) : null}
    </PartnerExperience>
  );
}
