export const APPOINTMENT_DEPOSIT_POLICY_URL = "https://policy.mydripnurse.com";
export const APPOINTMENT_CANCELLATION_WINDOW_HOURS = 24;
export const APPOINTMENT_DEPOSIT_POLICY_VERSION = "2026-08-02";
export const APPOINTMENT_DEPOSIT_SUPPORT_EMAIL = "info@mydripnurse.com";

export const APPOINTMENT_DEPOSIT_MESSAGE =
  `A deposit is required to reserve your appointment and is applied toward your service total. ` +
  `It is refundable if My Drip Nurse or the assigned provider cannot provide the appointment, including a provider no-show, or if you cancel at least ${APPOINTMENT_CANCELLATION_WINDOW_HOURS} hours before the scheduled start time. ` +
  `Cancellations made less than ${APPOINTMENT_CANCELLATION_WINDOW_HOURS} hours before the appointment and no-shows forfeit the deposit. ` +
  `The remaining balance is collected at the appointment. Review the full policy: ${APPOINTMENT_DEPOSIT_POLICY_URL}`;

export const APPOINTMENT_DEPOSIT_POLICY_SUMMARY = [
  {
    title: "Your deposit reserves the appointment",
    description:
      "The deposit shown during booking is applied toward the total price of the selected service.",
  },
  {
    title: "Cancel at least 24 hours before",
    description:
      "A cancellation received at least 24 hours before the scheduled start time is eligible for a deposit refund.",
  },
  {
    title: "Provider unable to attend",
    description:
      "If My Drip Nurse or the assigned provider cannot provide the scheduled appointment, including a provider no-show, you may choose a new time or receive a deposit refund.",
  },
  {
    title: "Late cancellation or no-show",
    description:
      "Cancellations made less than 24 hours before the appointment and patient no-shows are not eligible for a deposit refund.",
  },
] as const;
