import { NextRequest, NextResponse } from "next/server";
import { requirePartnerAdmin } from "@/lib/partnerAdminAuth";
import {
  listPartnerAdminNotificationSettings,
  savePartnerAdminCommunicationRouter,
  savePartnerAdminNotificationSettings,
  type PartnerAdminCommunicationRouter,
} from "@/lib/partnerAdminSettings";

export const dynamic = "force-dynamic";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "The notification settings request failed.";
}

export async function GET(req: NextRequest) {
  const auth = await requirePartnerAdmin(req, { ownerOnly: true });
  if ("response" in auth) return auth.response;

  try {
    const settings = await listPartnerAdminNotificationSettings();
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    return NextResponse.json({ ok: false, error: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requirePartnerAdmin(req, { ownerOnly: true });
  if ("response" in auth) return auth.response;

  try {
    const body = await req.json();
    if (body?.router) {
      const settings = await savePartnerAdminCommunicationRouter({
        tenantId: body?.tenantId,
        router: body.router as PartnerAdminCommunicationRouter,
        webhookUrl: body?.webhookUrl,
        clear: body?.clear,
      });
      return NextResponse.json({ ok: true, settings });
    }
    const settings = await savePartnerAdminNotificationSettings({
      tenantId: body?.tenantId,
      accountReadyWebhookUrl: body?.accountReadyWebhookUrl,
      applicantReceivedWebhookUrl: body?.applicantReceivedWebhookUrl,
      adminNotificationWebhookUrl: body?.adminNotificationWebhookUrl,
      partnerNotificationWebhookUrl: body?.partnerNotificationWebhookUrl,
      leadCaptureWebhookUrl: body?.leadCaptureWebhookUrl,
      appointmentCreatedWebhookUrl: body?.appointmentCreatedWebhookUrl,
      newBookingWebhookUrl: body?.newBookingWebhookUrl,
      partnerConfirmationRequiredWebhookUrl: body?.partnerConfirmationRequiredWebhookUrl,
      partnerRescheduledWebhookUrl: body?.partnerRescheduledWebhookUrl,
      appointmentAcceptedWebhookUrl: body?.appointmentAcceptedWebhookUrl,
      appointmentDeclinedWebhookUrl: body?.appointmentDeclinedWebhookUrl,
      appointmentReassignedWebhookUrl: body?.appointmentReassignedWebhookUrl,
      appointmentCompletedWebhookUrl: body?.appointmentCompletedWebhookUrl,
      appointmentRefundedWebhookUrl: body?.appointmentRefundedWebhookUrl,
      clientReferralWebhookUrl: body?.clientReferralWebhookUrl,
      adminBaseUrl: body?.adminBaseUrl,
      clearAccountReadyWebhook: body?.clearAccountReadyWebhook,
      clearApplicantWebhook: body?.clearApplicantWebhook,
      clearAdminWebhook: body?.clearAdminWebhook,
      clearPartnerWebhook: body?.clearPartnerWebhook,
      clearLeadCaptureWebhook: body?.clearLeadCaptureWebhook,
      clearAppointmentCreatedWebhook: body?.clearAppointmentCreatedWebhook,
      clearNewBookingWebhook: body?.clearNewBookingWebhook,
      clearPartnerConfirmationRequiredWebhook: body?.clearPartnerConfirmationRequiredWebhook,
      clearPartnerRescheduledWebhook: body?.clearPartnerRescheduledWebhook,
      clearAppointmentAcceptedWebhook: body?.clearAppointmentAcceptedWebhook,
      clearAppointmentDeclinedWebhook: body?.clearAppointmentDeclinedWebhook,
      clearAppointmentReassignedWebhook: body?.clearAppointmentReassignedWebhook,
      clearAppointmentCompletedWebhook: body?.clearAppointmentCompletedWebhook,
      clearAppointmentRefundedWebhook: body?.clearAppointmentRefundedWebhook,
      clearClientReferralWebhook: body?.clearClientReferralWebhook,
      affiliateCommissionRate: body?.affiliateCommissionRate,
    });
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    const message = errorMessage(error);
    const status = /required|valid url|https|not found/i.test(message) ? 400 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
