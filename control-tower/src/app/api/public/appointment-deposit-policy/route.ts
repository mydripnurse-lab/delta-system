import { NextResponse } from "next/server";
import {
  APPOINTMENT_CANCELLATION_WINDOW_HOURS,
  APPOINTMENT_DEPOSIT_MESSAGE,
  APPOINTMENT_DEPOSIT_POLICY_SUMMARY,
  APPOINTMENT_DEPOSIT_POLICY_URL,
  APPOINTMENT_DEPOSIT_POLICY_VERSION,
  APPOINTMENT_DEPOSIT_SUPPORT_EMAIL,
} from "@/lib/appointmentDepositPolicy";

export async function GET() {
  return NextResponse.json(
    {
      policyUrl: APPOINTMENT_DEPOSIT_POLICY_URL,
      version: APPOINTMENT_DEPOSIT_POLICY_VERSION,
      cancellationWindowHours: APPOINTMENT_CANCELLATION_WINDOW_HOURS,
      supportEmail: APPOINTMENT_DEPOSIT_SUPPORT_EMAIL,
      refundRequestUrl: "https://care.mydripnurse.com/refund-request",
      depositMessage: APPOINTMENT_DEPOSIT_MESSAGE,
      summary: APPOINTMENT_DEPOSIT_POLICY_SUMMARY,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=3600",
      },
    },
  );
}
