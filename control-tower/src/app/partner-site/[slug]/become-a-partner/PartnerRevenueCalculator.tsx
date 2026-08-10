"use client";

import { useState, type CSSProperties } from "react";

import styles from "./affiliateLanding.module.css";

const AVERAGE_APPOINTMENT_VALUE = 297;
const PARTNER_SHARE = 0.65;
const AVERAGE_WEEKS_PER_MONTH = 4.33;
const PARTNER_EARNINGS_PER_APPOINTMENT = AVERAGE_APPOINTMENT_VALUE * PARTNER_SHARE;

function dollars(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

function exactDollars(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function PartnerRevenueCalculator({
  applicationUrl,
}: {
  applicationUrl: string;
}) {
  const [weeklyAppointments, setWeeklyAppointments] = useState(10);
  const monthlyAppointments = weeklyAppointments * AVERAGE_WEEKS_PER_MONTH;
  const estimate = {
    monthlyAppointments: Math.round(monthlyAppointments),
    monthlyRevenue: monthlyAppointments * PARTNER_EARNINGS_PER_APPOINTMENT,
  };

  return (
    <div className={styles.calculator}>
      <div className={styles.calculatorIntro}>
        <span>Revenue planning tool · United States &amp; Puerto Rico</span>
        <h3>Estimate your additional monthly Partner revenue.</h3>
        <p>
          Based on a $297 average appointment value, a 65% Partner share, and
          4.33 average weeks per month.
        </p>
      </div>

      <div className={styles.sliderHeading}>
        <label htmlFor="partner-weekly-appointments">Appointments per week</label>
        <strong>{weeklyAppointments} appts/wk</strong>
      </div>
      <input
        id="partner-weekly-appointments"
        className={styles.revenueSlider}
        type="range"
        min="1"
        max="40"
        step="1"
        value={weeklyAppointments}
        onChange={(event) => setWeeklyAppointments(Number(event.target.value))}
        style={{ "--range-progress": `${((weeklyAppointments - 1) / 39) * 100}%` } as CSSProperties}
      />
      <div className={styles.sliderScale} aria-hidden="true">
        <span>1/wk</span><span>10/wk</span><span>20/wk</span><span>30/wk</span><span>40/wk</span>
      </div>

      <div className={styles.calculatorStats}>
        <article>
          <span>Appointments / month</span>
          <strong>{estimate.monthlyAppointments}</strong>
          <small>based on your weekly volume</small>
        </article>
        <article>
          <span>Your earnings per appointment</span>
          <strong>{exactDollars(PARTNER_EARNINGS_PER_APPOINTMENT)}</strong>
          <small>65% of the $297 average value</small>
        </article>
      </div>

      <div className={styles.revenueTotal} aria-live="polite">
        <span>Your estimated additional monthly revenue</span>
        <strong>{dollars(estimate.monthlyRevenue)}</strong>
        <small>plus 100% of your tips</small>
      </div>

      <dl className={styles.calculatorBreakdown}>
        <div><dt>Appointments / month (×4.33 weeks)</dt><dd>{estimate.monthlyAppointments}</dd></div>
        <div><dt>Average appointment value</dt><dd>$297.00</dd></div>
        <div><dt>My Drip Nurse network share</dt><dd>35%</dd></div>
        <div><dt>Your Partner share</dt><dd>65%</dd></div>
        <div><dt>Tips</dt><dd>100% yours</dd></div>
        <div><dt>Estimated additional revenue / month</dt><dd>{dollars(estimate.monthlyRevenue)}</dd></div>
      </dl>

      <a href={applicationUrl} className={styles.calculatorAction}>
        Start your Partner application <span aria-hidden="true">→</span>
      </a>
      <p className={styles.calculatorDisclaimer}>
        Estimates are illustrative and are not a guarantee of appointments or income. Actual
        service mix, pricing, availability, demand, eligibility, and results vary.
      </p>
    </div>
  );
}
