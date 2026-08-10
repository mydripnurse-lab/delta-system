/** Global booking safety rules shared by the admin and public booking flow. */
export const BOOKING_MINIMUM_NOTICE_MINUTES = 120;

export function enforceMinimumNoticeMinutes(value: number) {
  if (!Number.isFinite(value)) return BOOKING_MINIMUM_NOTICE_MINUTES;
  return Math.max(BOOKING_MINIMUM_NOTICE_MINUTES, Math.trunc(value));
}
