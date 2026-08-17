"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import styles from "@/app/client-portal/clientPortal.module.css";
import { BookingCalendarClient, type BookingInitialProfile } from "@/components/booking/BookingCalendarClient";
import ClientServiceCatalog from "@/components/client/ClientServiceCatalog";
import type { ClientServiceSummary } from "@/lib/clientPortalData";

type BookingMacroStep = 1 | 2 | 3;

const STEPS = [
  { number: "01", title: "Choose a service", description: "View every available treatment", mobileDescription: "Tap the care you want below" },
  { number: "02", title: "Set your visit", description: "Address, date and time", mobileDescription: "Choose your address, date and time" },
  { number: "03", title: "Confirm securely", description: "Review your appointment", mobileDescription: "Review the details and book" },
] as const;

export default function ClientBookingFlow({
  services,
  initialServiceSlug = "",
  partnerId = "",
  initialProfile,
}: {
  services: ClientServiceSummary[];
  initialServiceSlug?: string;
  partnerId?: string;
  initialProfile: BookingInitialProfile;
}) {
  const initialService = services.find((service) => service.slug === initialServiceSlug) || null;
  const [selectedService, setSelectedService] = useState<ClientServiceSummary | null>(initialService);
  const [activeStep, setActiveStep] = useState<BookingMacroStep>(initialService ? 2 : 1);
  const progressRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const focusStage = useCallback(() => {
    window.requestAnimationFrame(() => {
      const mobileProgress = window.matchMedia("(max-width: 640px)").matches ? progressRef.current : null;
      (mobileProgress || stageRef.current)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const chooseService = useCallback((service: ClientServiceSummary) => {
    setSelectedService(service);
    setActiveStep(2);
    window.history.replaceState({}, "", "/book");
    focusStage();
  }, [focusStage]);

  const changeService = useCallback(() => {
    setSelectedService(null);
    setActiveStep(1);
    window.history.replaceState({}, "", "/book");
    focusStage();
  }, [focusStage]);

  const updateBookingStep = useCallback((step: 2 | 3) => {
    setActiveStep(step);
  }, []);

  useEffect(() => {
    if (initialService) window.history.replaceState({}, "", "/book");
  }, [initialService]);

  const activeStepContent = STEPS[activeStep - 1];
  const nextStepContent = activeStep === 1 ? STEPS[1] : activeStep === 2 ? STEPS[2] : null;

  return (
    <div className={styles.pageShell}>
      <section className={styles.pageIntro}>
        <div>
          <span className={styles.eyebrow}>Book mobile care</span>
          <h1>What can we bring you?</h1>
          <p>Choose your treatment, set the visit and confirm securely without leaving this booking experience.</p>
        </div>
      </section>

      <ol className={styles.bookingSteps} aria-label="Booking progress">
        {STEPS.map((step, index) => {
          const stepNumber = (index + 1) as BookingMacroStep;
          const isActive = activeStep === stepNumber;
          const isComplete = activeStep > stepNumber;
          const canReturn = stepNumber === 1 && Boolean(selectedService);
          return (
            <li
              className={`${isActive ? styles.bookingStepActive : ""} ${isComplete ? styles.bookingStepComplete : ""}`.trim()}
              aria-current={isActive ? "step" : undefined}
              key={step.number}
            >
              {canReturn ? (
                <button type="button" className={styles.bookingStepButton} onClick={changeService} aria-label="Return to choose a service">
                  <span>{isComplete ? "✓" : step.number}</span>
                  <div><b>{step.title}</b><small>{step.description}</small></div>
                </button>
              ) : (
                <div className={styles.bookingStepStatic}>
                  <span>{isComplete ? "✓" : step.number}</span>
                  <div><b>{step.title}</b><small>{step.description}</small></div>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <div
        className={styles.bookingMobileProgress}
        ref={progressRef}
        role="group"
        aria-label={`Booking step ${activeStep} of ${STEPS.length}: ${activeStepContent.title}`}
        aria-live="polite"
      >
        <div className={styles.bookingMobileProgressHeader}>
          <span>Step {activeStep} of {STEPS.length}</span>
          {activeStep > 1 && selectedService ? (
            <button type="button" onClick={changeService}>Change service</button>
          ) : (
            <small>Start here</small>
          )}
        </div>
        <div className={styles.bookingMobileProgressCurrent}>
          <span>{activeStep}</span>
          <div>
            <strong>{activeStepContent.title}</strong>
            <p>{activeStepContent.mobileDescription}</p>
          </div>
        </div>
        <div className={styles.bookingMobileProgressTrack} aria-hidden="true">
          {STEPS.map((step, index) => {
            const stepNumber = index + 1;
            const progressClass = stepNumber < activeStep
              ? styles.bookingMobileProgressComplete
              : stepNumber === activeStep
                ? styles.bookingMobileProgressActive
                : "";
            return <span className={progressClass} key={step.number} />;
          })}
        </div>
        <small className={styles.bookingMobileProgressNext}>
          {nextStepContent ? <>Next: <b>{nextStepContent.title}</b></> : <b>Last step — review and book</b>}
        </small>
      </div>

      <div className={styles.bookingStage} ref={stageRef} key={selectedService?.id || "service-catalog"}>
        {selectedService ? (
          <>
            <div className={styles.bookingStageHeader}>
              <div>
                <span className={styles.eyebrow}>Selected treatment</span>
                <strong>{selectedService.name}</strong>
              </div>
              <button type="button" onClick={changeService}>Change service</button>
            </div>
            <div className={styles.bookingCalendarStage}>
              <BookingCalendarClient
                key={selectedService.publicKey}
                publicKey={selectedService.publicKey}
                partnerId={partnerId}
                initialProfile={initialProfile}
                onMacroStepChange={updateBookingStep}
                serviceName={selectedService.name}
                serviceImageUrl={selectedService.imageUrl}
                serviceImageAlt={selectedService.imageAlt}
              />
            </div>
          </>
        ) : (
          <ClientServiceCatalog services={services} actionLabel="Choose service" onSelect={chooseService} />
        )}
      </div>
    </div>
  );
}
