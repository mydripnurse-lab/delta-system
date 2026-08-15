"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

import { usePortalLocale } from "@/components/portal/PortalLocaleProvider";
import type { PartnerPortalScreen, PartnerPwaInstallState, PartnerPushState } from "./PartnerPortalClient";
import styles from "./partnerOnboardingTour.module.css";

type Props = {
  applicationId: string;
  partnerName: string;
  screen: PartnerPortalScreen;
  installState: PartnerPwaInstallState;
  installNotice: string;
  onInstall: () => Promise<void>;
  pushState: PartnerPushState;
  pushNotice: string;
  onEnablePush: () => Promise<void>;
  availabilityModalOpen: boolean;
  availabilityConfigured: boolean;
  availabilityLoading: boolean;
  availabilitySaving: boolean;
  onSaveAvailability: () => Promise<boolean>;
  blockDayModalOpen: boolean;
  demoAppointmentOpen: boolean;
  demoAppointmentAvailable: boolean;
  declineModalOpen: boolean;
  onTourPhaseChange: (phase: PartnerTourPhase) => void;
  onStartBlockDayPractice: () => void;
  onStartAppointmentDemo: () => void;
  onFinishAppointmentDemo: () => void;
  onReturnToAvailabilityPractice: () => void;
  onReturnToBlockDayPractice: () => void;
  onReturnToDemoAppointment: () => void;
  profilePhotoSelected: boolean;
  profileRoleComplete: boolean;
  profileCredentialsComplete: boolean;
  profileBiographyComplete: boolean;
  profileSaving: boolean;
  onSaveProfile: () => Promise<boolean>;
  initiallyCompleted?: boolean;
  initiallyRequired?: boolean;
};

export type PartnerTourPhase = "availability-button" | "availability-setup" | "block-day" | "appointment-demo" | "service-walkthrough" | "affiliate-walkthrough" | null;

type TourStep = {
  eyebrow: string;
  title: string;
  description: string;
  route: string;
  screen: PartnerPortalScreen;
  target?: string;
  kind?: "install" | "profile-walkthrough" | "website-walkthrough" | Exclude<PartnerTourPhase, null>;
};

type SpotlightRect = { top: number; left: number; width: number; height: number };

const PROFILE_TOUR_SEGMENTS = [
  { target: "profile-photo-upload", title: "Upload your professional photo.", description: "Choose a clear, current photo. It will appear in the My Drip Nurse directory and on your Partner website so patients can recognize you." },
  { target: "profile-role", title: "Choose your professional role.", description: "Select the primary licensed role that best describes how you practice." },
  { target: "profile-credentials", title: "Select your licenses and credentials.", description: "Choose every active license, degree or professional credential that should appear after your name." },
  { target: "profile-biography", title: "Write your professional biography.", description: "Use at least 120 characters to explain your experience, approach to patient care and why patients can feel confident booking with you." },
] as const;

const WEBSITE_TOUR_SEGMENTS = [
  { target: "website-public-url", title: "This is your Partner website.", description: "Use your public URL to preview your page or open the live website patients can visit." },
  { target: "website-preview-browser", title: "Explore the complete patient experience.", description: "Scroll inside this preview to review your full Partner website from top to bottom. Only the preview is interactive during this step." },
] as const;

const SERVICE_TOUR_SEGMENTS = [
  { target: "services-featured-service", title: "Manage a service from its card.", description: "This first card contains the service details, price, booking deposit and your estimated earnings. The tour will now show both availability controls without changing the service." },
  { target: "services-featured-pause", title: "Pause removes the service completely.", description: "Use Pause this service when you do not want to offer it. It disappears from your Partner website and patients cannot book it until you offer it again." },
  { target: "services-featured-stock", title: "Out of Stock keeps the landing page live.", description: "Use Out of Stock for a temporary supply issue. Patients can still see the service page, but it shows Out of Stock and removes all booking calendar availability until you select Back in Stock." },
] as const;

const AFFILIATE_TOUR_SEGMENTS = [
  { target: "affiliate-referral-link", title: "Share your personal referral link.", description: "Send this link to qualified healthcare professionals. Anyone who applies through it is connected to your affiliate account automatically." },
  { target: "affiliate-kpis", title: "See your affiliate results at a glance.", description: "Total earned includes every valid commission. Pending is still being processed, Paid has already been issued, and Referred partners shows the size of your network." },
  { target: "affiliate-demo-partner", title: "Each referred Partner appears here.", description: "This demo Partner shows where you will see their business, website status, attributed appointments and the commission they have generated for you." },
  { target: "affiliate-demo-commission", title: "Follow every attributed appointment.", description: "Each qualifying appointment shows the service, referred Partner, reference, commission amount, rate and payment status. The example shown is tour-only." },
] as const;

const TOUR_STEPS: TourStep[] = [
  {
    eyebrow: "Welcome to My Drip Nurse",
    title: "Your Partner Portal, made simple.",
    description: "In about three minutes, you will learn where everything lives and how to manage your work with confidence.",
    route: "/partner-portal",
    screen: "overview",
  },
  {
    eyebrow: "Overview · Partner score",
    title: "This is your Partner Score.",
    description: "It starts at 100. Each declined appointment lowers it by 10 points.",
    route: "/partner-portal",
    screen: "overview",
    target: "overview-kpi-score",
  },
  {
    eyebrow: "Overview · Revenue",
    title: "See what you have earned.",
    description: "This is the amount generated by completed visits that you collect at the appointment.",
    route: "/partner-portal",
    screen: "overview",
    target: "overview-kpi-revenue",
  },
  {
    eyebrow: "Overview · Completed",
    title: "Track completed visits.",
    description: "This number shows how many appointments you have successfully finished.",
    route: "/partner-portal",
    screen: "overview",
    target: "overview-kpi-completed",
  },
  {
    eyebrow: "Overview · Upcoming",
    title: "Know what is coming next.",
    description: "These are the appointments already scheduled on your calendar.",
    route: "/partner-portal",
    screen: "overview",
    target: "overview-kpi-upcoming",
  },
  {
    eyebrow: "Overview · Acceptance rate",
    title: "See how often you accept visits.",
    description: "Accept appointments you can complete. If you cannot attend, decline promptly so the patient can be reassigned.",
    route: "/partner-portal",
    screen: "overview",
    target: "overview-kpi-acceptance",
  },
  {
    eyebrow: "Appointments · 1 of 4",
    title: "Start with your availability.",
    description: "Tap the gear button to open your calendar setup. This is where you control when patients can book you.",
    route: "/partner-portal/appointments",
    screen: "appointments",
    target: "appointments-availability-button",
    kind: "availability-button",
  },
  {
    eyebrow: "Appointments · 2 of 4",
    title: "Set when patients can book you.",
    description: "New accounts begin with every day unavailable. Add at least one day and its hours now, or choose Skip for now and return later.",
    route: "/partner-portal/appointments",
    screen: "appointments",
    target: "appointments-availability-modal",
    kind: "availability-setup",
  },
  {
    eyebrow: "Appointments · 3 of 4",
    title: "Tap a day you cannot work.",
    description: "Choose a future day directly on the calendar. We will open the blocking options without saving anything.",
    route: "/partner-portal/appointments",
    screen: "appointments",
    target: "appointments-block-day-calendar",
    kind: "block-day",
  },
  {
    eyebrow: "Appointments · 4 of 4",
    title: "Practice with a sample appointment.",
    description: "Open the demo visit on the calendar. You will see where to accept or decline it without changing real data.",
    route: "/partner-portal/appointments",
    screen: "appointments",
    target: "appointments-demo-event",
    kind: "appointment-demo",
  },
  {
    eyebrow: "How patients see you",
    title: "Keep your public profile current.",
    description: "Your professional photo, title, credentials and biography help patients know who will care for them.",
    route: "/partner-portal/profile",
    screen: "profile",
    target: "profile-heading",
    kind: "profile-walkthrough",
  },
  {
    eyebrow: "Your online presence",
    title: "Preview your Partner website.",
    description: "Open the private preview, confirm that your information looks right, and share the public link once it is published.",
    route: "/partner-portal/website",
    screen: "website",
    target: "website-public-url",
    kind: "website-walkthrough",
  },
  {
    eyebrow: "What patients can book",
    title: "Control each service from one card.",
    description: "Pause hides the service and stops booking. Out of Stock keeps its landing page visible but removes calendar availability until you select Back in Stock.",
    route: "/partner-portal/services",
    screen: "services",
    target: "services-featured-service",
    kind: "service-walkthrough",
  },
  {
    eyebrow: "Grow your Partner network",
    title: "Earn from the Partners you refer.",
    description: "Share your referral link and follow every Partner, attributed appointment and commission from one place.",
    route: "/partner-portal/affiliates",
    screen: "affiliates",
    target: "affiliate-referral-link",
    kind: "affiliate-walkthrough",
  },
  {
    eyebrow: "You are never on your own",
    title: "Support is one message away.",
    description: "Open a secure ticket for appointments, payments, services or your website. Every reply stays in one conversation.",
    route: "/partner-portal/support",
    screen: "support",
    target: "support-workspace",
  },
  {
    eyebrow: "One last step",
    title: "Keep the portal on your home screen.",
    description: "Install the Partner Portal for one-tap access without searching for a link or opening another browser tab.",
    route: "/partner-portal",
    screen: "overview",
    kind: "install",
  },
];

function visibleTourTarget(target: string) {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour-id="${target}"]`));
  return candidates.find((element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  }) || null;
}

export default function PartnerOnboardingTour({ applicationId, partnerName, screen, installState, installNotice, onInstall, pushState, pushNotice, onEnablePush, availabilityModalOpen, availabilityConfigured, availabilityLoading, availabilitySaving, onSaveAvailability, blockDayModalOpen, demoAppointmentOpen, demoAppointmentAvailable, declineModalOpen, onTourPhaseChange, onStartBlockDayPractice, onStartAppointmentDemo, onFinishAppointmentDemo, onReturnToAvailabilityPractice, onReturnToBlockDayPractice, onReturnToDemoAppointment, profilePhotoSelected, profileRoleComplete, profileCredentialsComplete, profileBiographyComplete, profileSaving, onSaveProfile, initiallyCompleted = false, initiallyRequired = false }: Props) {
  const { locale } = usePortalLocale();
  const storageKey = `mdn:partner-tour:v1:${applicationId}`;
  const [open, setOpen] = useState(false);
  const [requiredTour, setRequiredTour] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);
  const [demoDetailStage, setDemoDetailStage] = useState(0);
  const [profileStage, setProfileStage] = useState(0);
  const [websiteStage, setWebsiteStage] = useState(0);
  const [serviceStage, setServiceStage] = useState(0);
  const [affiliateStage, setAffiliateStage] = useState(0);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const tourCardRef = useRef<HTMLElement | null>(null);
  const [mobileCardPlacement, setMobileCardPlacement] = useState<"top" | "bottom">("bottom");
  const step = TOUR_STEPS[stepIndex];
  const tourPhase: PartnerTourPhase = step.kind === "availability-button" || step.kind === "availability-setup" || step.kind === "block-day" || step.kind === "appointment-demo" || step.kind === "service-walkthrough" || step.kind === "affiliate-walkthrough" ? step.kind : null;
  const isProfileWalkthrough = step.kind === "profile-walkthrough";
  const profileSegment = PROFILE_TOUR_SEGMENTS[Math.min(profileStage, PROFILE_TOUR_SEGMENTS.length - 1)];
  const isWebsiteWalkthrough = step.kind === "website-walkthrough";
  const websiteSegment = WEBSITE_TOUR_SEGMENTS[Math.min(websiteStage, WEBSITE_TOUR_SEGMENTS.length - 1)];
  const isServiceWalkthrough = step.kind === "service-walkthrough";
  const serviceSegment = SERVICE_TOUR_SEGMENTS[Math.min(serviceStage, SERVICE_TOUR_SEGMENTS.length - 1)];
  const isAffiliateWalkthrough = step.kind === "affiliate-walkthrough";
  const affiliateSegment = AFFILIATE_TOUR_SEGMENTS[Math.min(affiliateStage, AFFILIATE_TOUR_SEGMENTS.length - 1)];
  const demoDetailTargets = [
    "appointments-demo-patient",
    "appointments-demo-address",
    "appointments-demo-collection",
    "appointments-demo-accept",
    "appointments-demo-decline",
  ];
  const effectiveTarget = isProfileWalkthrough
    ? profileSegment.target
    : isWebsiteWalkthrough
      ? websiteSegment.target
    : isServiceWalkthrough
      ? serviceSegment.target
    : isAffiliateWalkthrough
      ? affiliateSegment.target
    : tourPhase === "block-day" && blockDayModalOpen
    ? "appointments-block-day-modal"
    : tourPhase === "appointment-demo" && declineModalOpen
      ? "appointments-demo-decline-modal"
      : tourPhase === "appointment-demo" && demoAppointmentOpen
        ? demoDetailTargets[Math.min(demoDetailStage, demoDetailTargets.length - 1)]
        : step.target;
  const isWelcome = stepIndex === 0;
  const isLastStep = stepIndex === TOUR_STEPS.length - 1;
  const isInstallStep = step.kind === "install";
  const demoDetailTitles = [
    "Start with the patient and visit time.",
    "Confirm where the service will happen.",
    "Collection is what you receive at the visit.",
    "Accept when you can complete the appointment.",
    "Decline when you cannot attend.",
  ];
  const demoDetailDescriptions = [
    "Review the primary patient's contact details, date of birth, and the appointment's local date and time.",
    "Use the service address to plan your route. The Google Maps and Apple Maps links open the exact destination.",
    "This amount is collected by you at the appointment after the visit is completed.",
    "Use Accept appointment when you can complete the visit. This tour only explains the action; you do not need to select it.",
    "Use Decline when you cannot attend so My Drip Nurse can reassign the patient. This tour will not open the decline form or submit anything.",
  ];
  const displayTitle = isProfileWalkthrough
    ? profileSegment.title
    : isWebsiteWalkthrough
      ? websiteSegment.title
    : isServiceWalkthrough
      ? serviceSegment.title
    : isAffiliateWalkthrough
      ? affiliateSegment.title
    : tourPhase === "block-day" && blockDayModalOpen
    ? "Choose a full day or specific hours."
    : tourPhase === "appointment-demo" && declineModalOpen
      ? "Explain why you cannot attend."
      : tourPhase === "appointment-demo" && demoAppointmentOpen ? demoDetailTitles[demoDetailStage] : step.title;
  const displayDescription = isProfileWalkthrough
    ? profileSegment.description
    : isWebsiteWalkthrough
      ? websiteSegment.description
    : isServiceWalkthrough
      ? serviceSegment.description
    : isAffiliateWalkthrough
      ? affiliateSegment.description
    : tourPhase === "block-day" && blockDayModalOpen
    ? "Full day removes every open time. Block hours keeps the rest of the day available. This tour modal never saves a real block."
    : tourPhase === "appointment-demo" && declineModalOpen
      ? "A real decline requires a reason so My Drip Nurse can reassign the patient. This practice window is read-only and will not submit anything."
      : tourPhase === "appointment-demo" && demoAppointmentOpen ? demoDetailDescriptions[demoDetailStage] : step.description;
  const displayEyebrow = isProfileWalkthrough
    ? `Profile · ${profileStage + 1} of ${PROFILE_TOUR_SEGMENTS.length}`
    : isWebsiteWalkthrough
      ? `Partner website · ${websiteStage + 1} of ${WEBSITE_TOUR_SEGMENTS.length}`
    : isServiceWalkthrough
      ? `Services · ${serviceStage + 1} of ${SERVICE_TOUR_SEGMENTS.length}`
    : isAffiliateWalkthrough
      ? `Affiliates · ${affiliateStage + 1} of ${AFFILIATE_TOUR_SEGMENTS.length}`
    : tourPhase === "appointment-demo" && (demoAppointmentOpen || declineModalOpen)
      ? `Appointment details · ${Math.min(demoDetailStage + 1, 5)} of 5`
      : step.eyebrow;
  const demoActionRequired = tourPhase === "appointment-demo" && !demoAppointmentOpen && !declineModalOpen;
  const canEnablePush = isInstallStep && installState === "installed" && (pushState === "ready" || pushState === "error");
  const setupComplete = installState === "installed" && pushState === "subscribed";
  const websitePreviewInteractive = isWebsiteWalkthrough && websiteStage === WEBSITE_TOUR_SEGMENTS.length - 1;
  const availabilityModalInteractive = tourPhase === "availability-setup" && availabilityModalOpen;
  const profileRequirementMet = !isProfileWalkthrough || [
    profilePhotoSelected,
    profileRoleComplete,
    profileCredentialsComplete,
    profileBiographyComplete,
  ][profileStage];
  const spotlightActionLabel = tourPhase === "availability-button"
    ? "Open availability settings"
    : tourPhase === "block-day" && !blockDayModalOpen
      ? "Open block day options"
      : tourPhase === "appointment-demo" && !demoAppointmentOpen && !declineModalOpen
        ? "Open demo appointment" : "";
  const firstName = partnerName.split(" ")[0] || "Partner";
  const welcomeCopy = locale === "es" ? {
    topline: "Comencemos",
    eyebrow: "Bienvenido a My Drip Nurse",
    greeting: `Bienvenido, ${firstName}.`,
    headline: "Todo lo que necesitas para comenzar, en un solo lugar.",
    statement: "Bienvenido a My Drip Nurse, el primer Mobile IV Therapy Business con presencia en cada ciudad, county y estado de Estados Unidos, Puerto Rico y Canadá.",
    tourTitle: "Un recorrido breve y práctico",
    tourDescription: "Aprende a manejar citas, disponibilidad, perfil, servicios, afiliados y soporte desde tu portal.",
    faqTitle: "¿Buscas una respuesta específica?",
    faqDescription: "Pronto podrás elegir una pregunta frecuente y abrir exactamente el recorrido que necesitas.",
    faqStatus: "Próximamente",
    later: "Lo haré luego",
    start: "Comenzar recorrido",
  } : {
    topline: "Let’s get started",
    eyebrow: "Welcome to My Drip Nurse",
    greeting: `Welcome, ${firstName}.`,
    headline: "Everything you need to get started, in one place.",
    statement: "Welcome to My Drip Nurse, the first Mobile IV Therapy Business with a presence in every city, county, and state across the United States, Puerto Rico and Canada.",
    tourTitle: "A short, practical walkthrough",
    tourDescription: "Learn how to manage appointments, availability, your profile, services, affiliates and support from your portal.",
    faqTitle: "Looking for a specific answer?",
    faqDescription: "Soon you will be able to choose a common question and open the exact walkthrough you need.",
    faqStatus: "Coming soon",
    later: "Maybe later",
    start: "Start guided tour",
  };

  const scrollTargetIntoSafeZone = useCallback((target: HTMLElement) => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (window.innerWidth > 660) {
      target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center", inline: "center" });
      return;
    }
    const rect = target.getBoundingClientRect();
    const placement = rect.top + rect.height / 2 > window.innerHeight * .48 ? "top" : "bottom";
    setMobileCardPlacement(placement);
    target.style.scrollMarginTop = "86px";
    target.style.scrollMarginBottom = "112px";
    target.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: placement === "top" ? "end" : "start",
      inline: "center",
    });
  }, []);

  const positionSpotlight = useCallback(() => {
    if (!open || !effectiveTarget || step.screen !== screen) {
      setSpotlight(null);
      return;
    }
    const target = visibleTourTarget(effectiveTarget);
    if (!target) {
      setSpotlight(null);
      return;
    }
    const rect = target.getBoundingClientRect();
    if (window.innerWidth <= 660) {
      const cardHeight = tourCardRef.current?.getBoundingClientRect().height || 230;
      const topCardBottom = 72 + Math.min(cardHeight, window.innerHeight * .42);
      const bottomCardTop = window.innerHeight - 78 - Math.min(cardHeight, window.innerHeight * .42);
      const fitsAboveBottomCard = rect.bottom + 14 <= bottomCardTop;
      const fitsBelowTopCard = rect.top - 14 >= topCardBottom;
      setMobileCardPlacement(fitsAboveBottomCard ? "bottom" : fitsBelowTopCard ? "top" : rect.top + rect.height / 2 >= window.innerHeight / 2 ? "top" : "bottom");
    }
    const margin = window.innerWidth <= 660 ? 6 : 10;
    const keepBelowHeader = isProfileWalkthrough || isWebsiteWalkthrough || isServiceWalkthrough || isAffiliateWalkthrough;
    const notificationsButton = document.querySelector<HTMLElement>('button[aria-label="Notifications"]');
    const portalHeader = notificationsButton?.closest("header") || notificationsButton?.parentElement?.parentElement;
    const headerBottom = portalHeader?.getBoundingClientRect().bottom || (window.innerWidth <= 660 ? 72 : 88);
    const top = Math.max(keepBelowHeader ? headerBottom + 8 : 8, rect.top - margin);
    const left = Math.max(8, rect.left - margin);
    const right = Math.min(window.innerWidth - 8, rect.right + margin);
    const bottom = Math.min(window.innerHeight - 8, rect.bottom + margin);
    setSpotlight({
      top,
      left,
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top),
    });
  }, [effectiveTarget, isAffiliateWalkthrough, isProfileWalkthrough, isServiceWalkthrough, isWebsiteWalkthrough, open, screen, step.screen]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const onboardingMode = params.get("onboarding");
    const requested = onboardingMode === "1" || onboardingMode === "required" || initiallyRequired;
    const requestedRequired = onboardingMode === "required" || initiallyRequired;
    const saved = window.localStorage.getItem(storageKey);
    const initializeTour = window.setTimeout(() => {
      if (initiallyCompleted && !requested) {
        window.localStorage.setItem(storageKey, JSON.stringify({ status: "completed", step: TOUR_STEPS.length - 1, required: false }));
        setRequiredTour(false);
        setOpen(false);
        return;
      }
      if (requested || !saved) {
        setStepIndex(0);
        setRequiredTour(requestedRequired || !saved);
        window.localStorage.setItem(storageKey, JSON.stringify({ status: "in_progress", step: 0, required: requestedRequired || !saved }));
        setOpen(true);
      } else {
        try {
          const progress = JSON.parse(saved) as { status?: string; step?: number; required?: boolean };
          setRequiredTour(progress.required === true && progress.status !== "completed");
          if (progress.status === "completed" && Number.isInteger(progress.step) && Number(progress.step) < TOUR_STEPS.length - 1) {
            setStepIndex(TOUR_STEPS.length - 1);
            window.localStorage.setItem(storageKey, JSON.stringify({ status: "in_progress", step: TOUR_STEPS.length - 1, required: false }));
            setOpen(true);
          } else if (progress.status === "in_progress" && Number.isInteger(progress.step)) {
            setStepIndex(Math.max(0, Math.min(TOUR_STEPS.length - 1, Number(progress.step))));
            setOpen(true);
          }
        } catch {
          window.localStorage.removeItem(storageKey);
          setStepIndex(0);
          setOpen(true);
        }
      }
    }, 0);
    if (requested) {
      params.delete("onboarding");
      const nextSearch = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`);
    }
    return () => window.clearTimeout(initializeTour);
  }, [initiallyCompleted, initiallyRequired, storageKey]);

  useEffect(() => {
    if (!open) return;
    let revealTimer = 0;
    let retryTimer = 0;
    const revealTarget = () => {
      const target = effectiveTarget && step.screen === screen ? visibleTourTarget(effectiveTarget) : null;
      if (!target) return false;
      const rect = target.getBoundingClientRect();
      const isMobile = window.innerWidth <= 660;
      const visibleBottom = isMobile ? window.innerHeight * .46 : window.innerHeight - 16;
      const shouldAlwaysRevealTarget = isProfileWalkthrough || isWebsiteWalkthrough || isServiceWalkthrough || isAffiliateWalkthrough || tourPhase === "availability-button" || (tourPhase === "block-day" && !blockDayModalOpen);
      if (shouldAlwaysRevealTarget || rect.top < (isMobile ? 72 : 8) || rect.bottom > visibleBottom) {
        scrollTargetIntoSafeZone(target);
      }
      window.clearTimeout(revealTimer);
      revealTimer = window.setTimeout(positionSpotlight, isServiceWalkthrough ? 240 : 360);
      return true;
    };
    const targetReady = revealTarget();
    if (!targetReady && effectiveTarget && step.screen === screen) {
      let attempts = 0;
      retryTimer = window.setInterval(() => {
        attempts += 1;
        if (!revealTarget() && attempts < 30) return;
        window.clearInterval(retryTimer);
      }, 100);
    }
    window.addEventListener("resize", positionSpotlight);
    window.addEventListener("scroll", positionSpotlight, true);
    return () => {
      window.clearTimeout(revealTimer);
      window.clearInterval(retryTimer);
      window.removeEventListener("resize", positionSpotlight);
      window.removeEventListener("scroll", positionSpotlight, true);
    };
  }, [blockDayModalOpen, effectiveTarget, isAffiliateWalkthrough, isProfileWalkthrough, isServiceWalkthrough, isWebsiteWalkthrough, open, positionSpotlight, screen, scrollTargetIntoSafeZone, step.screen, tourPhase]);

  useEffect(() => {
    onTourPhaseChange(open ? tourPhase : null);
    return () => onTourPhaseChange(null);
  }, [onTourPhaseChange, open, tourPhase]);

  useEffect(() => {
    if (!open || screen !== "appointments" || tourPhase !== "appointment-demo" || demoAppointmentAvailable || declineModalOpen) return;
    onStartAppointmentDemo();
  }, [declineModalOpen, demoAppointmentAvailable, onStartAppointmentDemo, open, screen, tourPhase]);

  useEffect(() => {
    if (!open || tourPhase !== "availability-button" || !availabilityModalOpen) return;
    const nextIndex = Math.min(TOUR_STEPS.length - 1, stepIndex + 1);
    window.localStorage.setItem(storageKey, JSON.stringify({ status: "in_progress", step: nextIndex, required: requiredTour }));
    const advanceTimer = window.setTimeout(() => setStepIndex(nextIndex), 0);
    return () => window.clearTimeout(advanceTimer);
  }, [availabilityModalOpen, open, requiredTour, stepIndex, storageKey, tourPhase]);

  useEffect(() => {
    if (!open) return;
    headingRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (requiredTour) return;
      window.localStorage.setItem(storageKey, JSON.stringify({ status: "dismissed", step: stepIndex, required: false }));
      setOpen(false);
      setSpotlight(null);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open, requiredTour, stepIndex, storageKey]);

  function moveTo(nextIndex: number) {
    const boundedIndex = Math.max(0, Math.min(TOUR_STEPS.length - 1, nextIndex));
    const nextStep = TOUR_STEPS[boundedIndex];
    window.localStorage.setItem(storageKey, JSON.stringify({ status: "in_progress", step: boundedIndex, required: requiredTour }));
    if (nextStep.screen !== screen) {
      window.location.assign(nextStep.route);
      return;
    }
    setStepIndex(boundedIndex);
  }

  function startTour() {
    moveTo(1);
  }

  function revealAvailabilityButton() {
    const target = visibleTourTarget("appointments-availability-button");
    if (!target) return;
    scrollTargetIntoSafeZone(target);
    window.setTimeout(positionSpotlight, 360);
  }

  function revealBlockDayTarget() {
    const target = visibleTourTarget("appointments-block-day-calendar");
    if (!target) return;
    scrollTargetIntoSafeZone(target);
    window.setTimeout(positionSpotlight, 360);
  }

  function activateSpotlightTarget() {
    if (!spotlightActionLabel || !effectiveTarget) return;
    visibleTourTarget(effectiveTarget)?.click();
  }

  function moveBack() {
    if (isProfileWalkthrough && profileStage > 0) {
      setProfileStage((current) => Math.max(0, current - 1));
      return;
    }
    if (isServiceWalkthrough && serviceStage > 0) {
      setServiceStage((current) => Math.max(0, current - 1));
      return;
    }
    if (isAffiliateWalkthrough && affiliateStage > 0) {
      setAffiliateStage((current) => Math.max(0, current - 1));
      return;
    }
    if (isWebsiteWalkthrough && websiteStage > 0) {
      setWebsiteStage((current) => Math.max(0, current - 1));
      return;
    }
    if (tourPhase === "appointment-demo" && declineModalOpen) {
      onReturnToDemoAppointment();
      setDemoDetailStage(4);
      return;
    }
    if (tourPhase === "appointment-demo" && demoAppointmentOpen && demoDetailStage > 0) {
      setDemoDetailStage((current) => current - 1);
      return;
    }
    if (tourPhase === "appointment-demo") onReturnToBlockDayPractice();
    if (tourPhase === "block-day") onReturnToAvailabilityPractice();
    if (tourPhase === "availability-setup") onFinishAppointmentDemo();
    moveTo(stepIndex - 1);
  }

  async function moveForward() {
    if (isProfileWalkthrough) {
      if (!profileRequirementMet || profileSaving) return;
      if (profileStage < PROFILE_TOUR_SEGMENTS.length - 1) {
        setProfileStage((current) => Math.min(PROFILE_TOUR_SEGMENTS.length - 1, current + 1));
        return;
      }
      if (!await onSaveProfile()) return;
      moveTo(stepIndex + 1);
      return;
    }
    if (isServiceWalkthrough && serviceStage < SERVICE_TOUR_SEGMENTS.length - 1) {
      setServiceStage((current) => Math.min(SERVICE_TOUR_SEGMENTS.length - 1, current + 1));
      return;
    }
    if (isAffiliateWalkthrough && affiliateStage < AFFILIATE_TOUR_SEGMENTS.length - 1) {
      setAffiliateStage((current) => Math.min(AFFILIATE_TOUR_SEGMENTS.length - 1, current + 1));
      return;
    }
    if (isWebsiteWalkthrough && websiteStage < WEBSITE_TOUR_SEGMENTS.length - 1) {
      setWebsiteStage((current) => Math.min(WEBSITE_TOUR_SEGMENTS.length - 1, current + 1));
      return;
    }
    if (tourPhase === "availability-setup") {
      if (!availabilityConfigured || availabilityLoading || availabilitySaving) return;
      if (!await onSaveAvailability()) return;
      onStartBlockDayPractice();
      moveTo(stepIndex + 1);
      return;
    }
    if (tourPhase === "block-day" && blockDayModalOpen) {
      setDemoDetailStage(0);
      onStartAppointmentDemo();
      moveTo(stepIndex + 1);
      return;
    }
    if (tourPhase === "appointment-demo" && demoAppointmentOpen && demoDetailStage < 4) {
      setDemoDetailStage((current) => current + 1);
      return;
    }
    if (tourPhase === "appointment-demo" && demoAppointmentOpen && demoDetailStage === 4) {
      onFinishAppointmentDemo();
      moveTo(stepIndex + 1);
      return;
    }
    if (tourPhase === "appointment-demo" && declineModalOpen) {
      onFinishAppointmentDemo();
      moveTo(stepIndex + 1);
      return;
    }
    moveTo(stepIndex + 1);
  }

  function skipAvailability() {
    if (tourPhase !== "availability-setup" || availabilitySaving) return;
    onStartBlockDayPractice();
    moveTo(stepIndex + 1);
  }

  function dismissTour() {
    if (requiredTour) return;
    window.localStorage.setItem(storageKey, JSON.stringify({ status: "dismissed", step: stepIndex, required: false }));
    onFinishAppointmentDemo();
    setOpen(false);
    setSpotlight(null);
  }

  function finishTour() {
    window.localStorage.setItem(storageKey, JSON.stringify({ status: "completed", step: TOUR_STEPS.length - 1, required: false }));
    void fetch("/api/partner-portal/tour", {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
    });
    setRequiredTour(false);
    onFinishAppointmentDemo();
    setOpen(false);
    setSpotlight(null);
  }

  function restartTour() {
    setStepIndex(0);
    setRequiredTour(false);
    setOpen(true);
  }

  return (
    <>
      <button type="button" className={styles.launcher} onClick={restartTour} aria-label="Open guided Partner Portal tour">
        <span aria-hidden="true">✦</span><strong>Portal tour</strong>
      </button>

      {open ? (
        <div className={styles.tourLayer} aria-live="polite">
          {spotlight ? (
            <>
              <div className={styles.interactionBlocker} style={{ inset: `0 0 auto 0`, height: spotlight.top }} aria-hidden="true" />
              <div className={styles.interactionBlocker} style={{ top: spotlight.top, left: 0, width: spotlight.left, height: spotlight.height }} aria-hidden="true" />
              <div className={styles.interactionBlocker} style={{ top: spotlight.top, left: spotlight.left + spotlight.width, right: 0, height: spotlight.height }} aria-hidden="true" />
              <div className={styles.interactionBlocker} style={{ top: spotlight.top + spotlight.height, right: 0, bottom: 0, left: 0 }} aria-hidden="true" />
              <div
                className={`${styles.spotlight} ${spotlightActionLabel ? styles.spotlightAction : ""} ${isProfileWalkthrough || websitePreviewInteractive || availabilityModalInteractive ? styles.spotlightPassthrough : ""}`}
                style={{ top: spotlight.top, left: spotlight.left, width: spotlight.width, height: spotlight.height }}
                role={spotlightActionLabel ? "button" : undefined}
                tabIndex={spotlightActionLabel ? 0 : undefined}
                aria-label={spotlightActionLabel || undefined}
                aria-hidden={spotlightActionLabel ? undefined : "true"}
                onClick={activateSpotlightTarget}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  activateSpotlightTarget();
                }}
              />
            </>
          ) : <div className={styles.backdrop} aria-hidden="true" />}

          <section
            ref={tourCardRef}
            className={`${styles.tourCard} ${isWelcome ? styles.welcomeCard : ""} ${isProfileWalkthrough ? styles.profileTourCard : ""} ${isWebsiteWalkthrough ? styles.websiteTourCard : ""} ${isServiceWalkthrough ? styles.serviceTourCard : ""} ${isAffiliateWalkthrough ? styles.affiliateTourCard : ""} ${tourPhase === "availability-button" || tourPhase === "availability-setup" || tourPhase === "appointment-demo" ? styles.tourCardLeft : ""} ${tourPhase === "block-day" && !blockDayModalOpen || tourPhase === "appointment-demo" && demoAppointmentOpen && demoDetailStage >= 3 ? styles.tourCardTop : ""} ${mobileCardPlacement === "top" ? styles.mobileTourCardTop : styles.mobileTourCardBottom} ${spotlightActionLabel ? styles.mobileActionCard : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="partner-tour-title"
          >
            <div className={styles.cardTopline}>
              <span>{isWelcome ? welcomeCopy.topline : `Step ${stepIndex} of ${TOUR_STEPS.length - 1}`}</span>
              {!requiredTour ? <button type="button" onClick={dismissTour} aria-label="Close guided tour">×</button> : <span className={styles.requiredTourBadge}>Required setup</span>}
            </div>

            {isWelcome ? (
              <div className={styles.welcomeStage}>
                <Image className={styles.welcomeLogo} src="/mdn-logo.png" alt="My Drip Nurse" width={240} height={51} priority />
                <div className={styles.welcomeNarrative}>
                  <span className={styles.welcomeEyebrow}><i aria-hidden="true" />{welcomeCopy.eyebrow}</span>
                  <h2 id="partner-tour-title" ref={headingRef} tabIndex={-1}>{welcomeCopy.greeting}</h2>
                  <h3>{welcomeCopy.headline}</h3>
                  <p className={styles.welcomeStatement}>{welcomeCopy.statement}</p>
                </div>

                <div className={styles.welcomeGuideSummary}>
                  <span aria-hidden="true">→</span>
                  <div><strong>{welcomeCopy.tourTitle}</strong><p>{welcomeCopy.tourDescription}</p></div>
                </div>

                <div className={styles.welcomeFaqPreview}>
                  <span aria-hidden="true">?</span>
                  <div><strong>{welcomeCopy.faqTitle}</strong><p>{welcomeCopy.faqDescription}</p></div>
                  <small>{welcomeCopy.faqStatus}</small>
                </div>
              </div>
            ) : (
              <>
                <span className={styles.eyebrow}>{displayEyebrow}</span>
                <h2 id="partner-tour-title" ref={headingRef} tabIndex={-1}>{displayTitle}</h2>
                <p>{displayDescription}</p>
              </>
            )}

            {isInstallStep ? (
              <div className={styles.installPanel} data-state={installState}>
                <div className={styles.installDevice} aria-hidden="true">
                  <span>MDN</span><i>+</i>
                </div>
                <div className={styles.installInstructions}>
                  {installState === "installed" ? (
                    <><strong>Installed and ready</strong><p>You can now open MDN Partner directly from this device.</p></>
                  ) : installState === "ios" ? (
                    <><strong>Add it from Safari</strong><ol><li>Tap the Share button.</li><li>Choose <b>Add to Home Screen</b>.</li><li>Turn on <b>Open as Web App</b>, then tap Add.</li></ol></>
                  ) : installState === "available" ? (
                    <><strong>Ready to install</strong><p>Your browser can add MDN Partner to this device now.</p></>
                  ) : (
                    <><strong>Add it from your browser</strong><p>Open the browser menu and choose <b>Install app</b> or <b>Add to Home Screen</b>.</p></>
                  )}
                </div>
                {installNotice ? <p className={styles.installNotice}>{installNotice}</p> : null}
                <div className={styles.pushStatus} data-enabled={pushState === "subscribed" ? "true" : "false"}>
                  <span aria-hidden="true">{pushState === "subscribed" ? "✓" : "○"}</span>
                  <div>
                    <strong>{pushState === "subscribed" ? "Appointment alerts enabled" : "Enable appointment alerts"}</strong>
                    <p>{pushState === "subscribed"
                      ? "New appointments and visit reminders can reach this device even when the portal is closed."
                      : pushState === "denied"
                        ? "Notifications are blocked in this device's settings."
                        : pushState === "unavailable" || pushState === "unsupported"
                          ? "Alerts are not available on this device yet."
                          : "Get reminders to confirm, start and complete each appointment."}</p>
                  </div>
                </div>
                {pushNotice ? <p className={styles.installNotice}>{pushNotice}</p> : null}
              </div>
            ) : null}

            {!isWelcome ? (
              <div className={styles.progressTrack} aria-label={`Tour progress: step ${stepIndex} of ${TOUR_STEPS.length - 1}`}>
                <span style={{ width: `${(stepIndex / (TOUR_STEPS.length - 1)) * 100}%` }} />
              </div>
            ) : null}

            <div className={styles.actions}>
              {!isWelcome ? <button type="button" className={styles.secondaryButton} onClick={moveBack}>Back</button> : !requiredTour ? <button type="button" className={styles.secondaryButton} onClick={dismissTour}>{welcomeCopy.later}</button> : null}
              {tourPhase === "availability-setup" ? <button type="button" className={styles.secondaryButton} onClick={skipAvailability} disabled={availabilitySaving}>Skip for now</button> : null}
              {isInstallStep && !setupComplete && !requiredTour ? <button type="button" className={styles.secondaryButton} onClick={finishTour}>Finish for now</button> : null}
              <button
                type="button"
                className={styles.primaryButton}
                onClick={isWelcome ? startTour : tourPhase === "availability-button" ? revealAvailabilityButton : tourPhase === "block-day" && !blockDayModalOpen ? revealBlockDayTarget : isInstallStep && installState === "available" ? () => void onInstall() : canEnablePush ? () => void onEnablePush() : isLastStep ? finishTour : () => void moveForward()}
                disabled={(isInstallStep && (installState === "checking" || pushState === "checking")) || demoActionRequired || !profileRequirementMet || profileSaving || (tourPhase === "availability-setup" && (!availabilityConfigured || availabilityLoading || availabilitySaving))}
              >
                {isWelcome ? welcomeCopy.start
                  : tourPhase === "availability-button" ? "Show me the gear"
                    : tourPhase === "availability-setup" ? availabilitySaving ? "Saving availability…" : availabilityConfigured ? "Save & continue" : "Select a day or skip"
                      : tourPhase === "block-day" && !blockDayModalOpen ? "Show me the day"
                        : tourPhase === "block-day" ? "Show demo appointment"
                      : tourPhase === "appointment-demo" && !demoAppointmentOpen && !declineModalOpen ? "Open the demo visit"
                        : tourPhase === "appointment-demo" && demoAppointmentOpen && demoDetailStage < 4 ? "Next detail"
                          : tourPhase === "appointment-demo" && demoAppointmentOpen ? "Continue tour"
                            : tourPhase === "appointment-demo" && declineModalOpen ? "Continue tour"
                              : isProfileWalkthrough && profileStage === 0 ? "Next: professional role"
                                : isProfileWalkthrough && profileStage === 1 ? "Next: credentials"
                                  : isProfileWalkthrough && profileStage === 2 ? "Next: biography"
                                    : isProfileWalkthrough ? profileSaving ? "Saving profile…" : "Save and continue"
                                : isWebsiteWalkthrough && websiteStage === 0 ? "Show website preview"
                                  : isWebsiteWalkthrough ? "Continue tour"
                          : isInstallStep && installState === "available" ? "Install Partner Portal"
                            : canEnablePush ? "Enable appointment alerts"
                              : isLastStep ? "Finish tour" : "Next"}<span aria-hidden="true">→</span>
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
