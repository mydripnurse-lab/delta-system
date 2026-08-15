import { NextResponse } from "next/server";
import { z } from "zod";

import { captureBookingLead } from "@/lib/bookingLeadCapture";
import { GENDER_IDENTITY_VALUES } from "@/lib/genderIdentity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const personSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().min(7).max(30),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weight: z.string().trim().max(20).optional().default(""),
  height: z.string().trim().max(20).optional().default(""),
  genderIdentity: z.enum(GENDER_IDENTITY_VALUES).optional().default("prefer_not_to_say"),
});

const schema = z.object({
  publicKey: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
  idempotencyKey: z.string().trim().min(16).max(160),
  requestedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  timezone: z.string().trim().max(100).optional(),
  // This may be a partner UUID from our picker or a referral/partner slug
  // carried by a GHL URL parameter. Keep it as context rather than a FK.
  requestedPartnerId: z.string().trim().max(160).optional(),
  customer: personSchema,
  attendees: z.array(personSchema).max(8).optional().default([]),
  address: z.object({
    addressLine1: z.string().trim().max(200).default(""),
    addressLine2: z.string().trim().max(200).optional().default(""),
    city: z.string().trim().min(1).max(120),
    county: z.string().trim().min(2).max(120),
    state: z.string().trim().min(2).max(100),
    postalCode: z.string().trim().max(20).default(""),
    countryCode: z.string().trim().length(2).optional().default("US"),
    longitude: z.number().min(-180).max(180).optional(),
    latitude: z.number().min(-90).max(90).optional(),
  }),
  medicalScreening: z.object({
    selected: z.array(z.string().trim().min(1).max(80)).max(10),
    noneSelected: z.boolean(),
    completedAt: z.string().datetime({ offset: true }).optional(),
  }),
  sourceUrl: z.string().trim().url().max(2000).optional(),
  pageUrl: z.string().trim().url().max(2000).optional(),
  referrer: z.string().trim().url().max(2000).optional(),
  attribution: z.record(z.string().max(100), z.string().max(300)).optional().default({}),
  eligiblePartners: z.array(z.object({
    id: z.string().uuid(),
    displayName: z.string().max(160),
    businessName: z.string().max(160),
    profilePhotoUrl: z.string().max(2000).optional(),
  })).max(100).optional().default([]),
  availabilityDiagnostics: z.object({
    availabilityChecked: z.boolean(),
    coverageAvailable: z.boolean().nullable(),
    availableSlotCount: z.number().int().min(0).max(500),
  }).optional(),
});

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const result = await captureBookingLead(input);
    return NextResponse.json(
      { ok: true, ...result },
      { status: result.status === "failed" ? 202 : 201, headers: { ...cors, "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Complete the patient, screening and appointment location information." }, { status: 400, headers: cors });
    }
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "The lead could not be captured." }, { status: 400, headers: cors });
  }
}
