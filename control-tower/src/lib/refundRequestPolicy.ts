export const REFUND_REASON_OPTIONS = [
  { value: "cancel_24_hours", label: "I need to cancel my appointment" },
  { value: "provider_unavailable", label: "My care professional could not attend" },
  { value: "provider_no_show", label: "My care professional did not arrive" },
  { value: "duplicate_charge", label: "I was charged more than once" },
  { value: "incorrect_charge", label: "The charge amount looks incorrect" },
  { value: "exceptional_circumstance", label: "An exceptional circumstance prevented my visit" },
  { value: "other", label: "Something else" },
] as const;

export type RefundReasonCode = (typeof REFUND_REASON_OPTIONS)[number]["value"];
