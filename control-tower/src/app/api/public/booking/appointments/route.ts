import { NextResponse } from "next/server";
import { z } from "zod";

import { createAppointmentCheckout } from "@/lib/appointmentBooking";
import { getAuthenticatedClientFromRequest } from "@/lib/clientPortalAuth";
import { GENDER_IDENTITY_VALUES } from "@/lib/genderIdentity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const checkoutHosts = new Set([
  "care.mydripnurse.com",
  "partners.mydripnurse.com",
  "admin.mydripnurse.com",
]);

function trustedCheckoutOrigin(value: string | null) {
  if (!value) return "";
  try {
    const url = new URL(value);
    const localDevelopment = ["localhost", "127.0.0.1"].includes(url.hostname) && url.protocol === "http:";
    return (url.protocol === "https:" && checkoutHosts.has(url.hostname)) || localDevelopment ? url.origin : "";
  } catch {
    return "";
  }
}

function trustedCheckoutCancelUrl(value: string | undefined, origin: string) {
  if (!value || !origin) return "";
  try {
    const url = new URL(value);
    if (url.origin !== origin) return "";
    url.searchParams.set("payment", "cancelled");
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function trustedCheckoutReturnUrl(value: string | undefined, origin: string) {
  if (!value || !origin) return "";
  try {
    const url = new URL(value);
    if (url.origin !== origin) return "";
    url.searchParams.delete("payment");
    url.searchParams.delete("appointment");
    url.searchParams.delete("session_id");
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

const medicalScreeningSchema = z.object({
  selected: z.array(z.string().trim().min(1).max(80)).max(10),
  noneSelected: z.boolean(),
  completedAt: z.string().datetime({ offset: true }).optional(),
}).superRefine((value, context) => {
  const isClear = value.noneSelected && value.selected.length === 1 && value.selected[0] === "none";
  if (!isClear) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Online booking requires a clear medical screening." });
  }
});

const dateOfBirthSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date of birth.").refine((value) => value <= new Date().toISOString().slice(0, 10), "Date of birth cannot be in the future.");
const weightSchema = z.string().trim().max(20).regex(/^\d{1,4}(?:\.\d{1,2})?$/, "Enter a valid weight.").refine((value) => {
  const weight = Number(value);
  return Number.isFinite(weight) && weight >= 1 && weight <= 1000;
}, "Weight must be between 1 and 1,000 lb.");
const heightSchema = z.string().trim().max(3).regex(/^\d+$/, "Enter height in total inches.").refine((value) => {
  const height = Number(value);
  return Number.isInteger(height) && height >= 1 && height <= 107;
}, "Height must be between 1 and 107 inches.");

const personSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().min(7).max(30),
  dateOfBirth: dateOfBirthSchema,
  weight: weightSchema,
  height: heightSchema,
  genderIdentity: z.enum(GENDER_IDENTITY_VALUES),
});

const bookingSchema = z.object({
  publicKey: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startsAt: z.string().datetime({ offset: true }),
  timezone: z.string().trim().min(3).max(100),
  requestedPartnerId: z.string().uuid().optional(),
  customer: personSchema,
  attendees: z.array(personSchema).max(8).optional().default([]),
  address: z.object({
    addressLine1: z.string().trim().min(3).max(200),
    addressLine2: z.string().trim().max(200).optional().default(""),
    city: z.string().trim().min(1).max(120),
    county: z.string().trim().min(2).max(120),
    state: z.string().trim().min(2).max(100),
    postalCode: z.string().trim().min(3).max(20),
    countryCode: z.string().trim().length(2).optional().default("US"),
    longitude: z.number().min(-180).max(180).optional(),
    latitude: z.number().min(-90).max(90).optional(),
  }),
  medicalScreening: medicalScreeningSchema,
  sourceUrl: z.string().trim().url().max(2000).optional(),
  returnUrl: z.string().trim().url().max(2000).optional(),
  directoryAttribution: z.object({
    source: z.literal("partner_directory"),
    partnerProfileId: z.string().uuid(),
    attributedAt: z.string().datetime({ offset: true }),
  }).optional(),
});

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function POST(request: Request) {
  try {
    const input = bookingSchema.parse(await request.json());
    const clientAccount = await getAuthenticatedClientFromRequest(request);
    const clientAccountId = clientAccount?.email.toLowerCase() === input.customer.email.toLowerCase()
      ? clientAccount.id
      : undefined;
    const checkoutReturnBaseUrl = trustedCheckoutOrigin(request.headers.get("origin"))
      || trustedCheckoutOrigin(request.url);
    const checkoutCancelUrl = trustedCheckoutCancelUrl(input.returnUrl, checkoutReturnBaseUrl);
    const checkoutReturnUrl = trustedCheckoutReturnUrl(input.returnUrl, checkoutReturnBaseUrl);
    const checkoutHostname = checkoutReturnBaseUrl ? new URL(checkoutReturnBaseUrl).hostname : "";
    const embeddedCheckout = checkoutHostname === "care.mydripnurse.com"
      || checkoutHostname === "localhost"
      || checkoutHostname === "127.0.0.1";
    const result = await createAppointmentCheckout({
      ...input,
      checkoutReturnBaseUrl: checkoutReturnBaseUrl || undefined,
      checkoutCancelUrl: checkoutCancelUrl || undefined,
      checkoutReturnUrl: checkoutReturnUrl || undefined,
      embeddedCheckout,
      clientAccountId,
      customer: {
        firstName: input.customer.firstName,
        lastName: input.customer.lastName,
        fullName: `${input.customer.firstName} ${input.customer.lastName}`.trim(),
        email: input.customer.email,
        phone: input.customer.phone,
        dateOfBirth: input.customer.dateOfBirth,
        weight: input.customer.weight,
        height: input.customer.height,
        genderIdentity: input.customer.genderIdentity,
      },
      attendees: input.attendees,
    });
    if (result.status === "no_coverage") {
      return NextResponse.json(
        {
          ok: false,
          status: result.status,
          demandRequestId: result.demandRequestId,
          message: "My Drip Nurse does not currently have an available Partner for this service area. Your request was saved for coverage expansion.",
        },
        { status: 409, headers: { ...cors, "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { ok: true, ...result },
      { status: 201, headers: { ...cors, "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Invalid booking information." }, { status: 400, headers: cors });
    }
    const message = error instanceof Error ? error.message : "The appointment could not be created.";
    const conflict = /no longer available|just reserved/i.test(message);
    const unavailable = /not configured/i.test(message);
    return NextResponse.json(
      { ok: false, error: message },
      { status: conflict ? 409 : unavailable ? 503 : 400, headers: cors },
    );
  }
}
