import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requirePartnerAdmin } from "@/lib/partnerAdminAuth";
import {
  createAdminService,
  listAdminServices,
  listPartnerServiceSuggestions,
  updateAdminService,
} from "@/lib/myDripNurseServiceCatalog";
import type { AdminServiceInput } from "@/lib/myDripNurseServiceCatalog";
import { BOOKING_MINIMUM_NOTICE_MINUTES } from "@/lib/bookingPolicy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const pageReference = z.string().trim().max(1000).refine(
  (value) => !/^javascript:/i.test(value),
  "Page links cannot use JavaScript URLs.",
);

const serviceInputSchema = z.object({
  slug: z.string().trim().min(2).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().trim().min(2).max(160),
  shortDescription: z.string().trim().max(500),
  fullDescription: z.string().trim().max(12000),
  ingredients: z.array(z.string().trim().min(1).max(160)).max(40),
  benefits: z.array(z.string().trim().min(1).max(280)).max(30),
  medicalDisclaimer: z.string().trim().max(3000),
  price: z.number().finite().min(0).max(1_000_000),
  currency: z.string().trim().regex(/^[A-Z]{3}$/),
  depositType: z.enum(["percentage", "fixed"]),
  depositValue: z.number().finite().min(0).max(1_000_000),
  imageUrl: z.union([z.literal(""), z.string().url().refine((value) => value.startsWith("https://"), "Image URL must use HTTPS.")]),
  imageAlt: z.string().trim().max(300),
  imageTitle: z.string().trim().max(300),
  landingPageUrl: pageReference,
  surveyCtaUrl: pageReference,
  editorialStatus: z.enum(["draft", "review", "approved", "published", "archived"]),
  isActive: z.boolean(),
  calendar: z.object({
    status: z.enum(["draft", "active", "paused", "archived"]),
    durationMinutes: z.number().int().min(5).max(1440),
    slotIntervalMinutes: z.number().int().min(5).max(1440),
    bufferBeforeMinutes: z.number().int().min(0).max(1440),
    bufferAfterMinutes: z.number().int().min(0).max(1440),
    minimumNoticeMinutes: z.number().int().min(BOOKING_MINIMUM_NOTICE_MINUTES).max(525600),
    maximumAdvanceDays: z.number().int().min(1).max(730),
    dailyCapacity: z.number().int().min(1).max(1000).nullable(),
  }),
}).superRefine((input, context) => {
  if (input.depositType === "percentage" && input.depositValue > 100) {
    context.addIssue({
      code: "custom",
      path: ["depositValue"],
      message: "Percentage deposits cannot exceed 100%.",
    });
  }
});

function errorMessage(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0]?.message || "Review the service fields.";
  if (error && typeof error === "object" && "code" in error && String(error.code) === "23505") {
    return "A service with this slug already exists.";
  }
  return error instanceof Error ? error.message : "The service request failed.";
}

export async function GET(req: NextRequest) {
  const auth = await requirePartnerAdmin(req);
  if ("response" in auth) return auth.response;
  try {
    return NextResponse.json(
      { ok: true, services: await listAdminServices(), suggestions: await listPartnerServiceSuggestions() },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json({ ok: false, error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requirePartnerAdmin(req);
  if ("response" in auth) return auth.response;
  try {
    const input = serviceInputSchema.parse(await req.json()) as AdminServiceInput;
    const serviceId = await createAdminService(input);
    return NextResponse.json(
      { ok: true, serviceId, services: await listAdminServices() },
      { status: 201, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json({ ok: false, error: errorMessage(error) }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requirePartnerAdmin(req);
  if ("response" in auth) return auth.response;
  try {
    const body = await req.json();
    const serviceId = z.string().uuid().parse(body?.serviceId);
    const input = serviceInputSchema.parse(body?.service) as AdminServiceInput;
    await updateAdminService(serviceId, input);
    return NextResponse.json(
      { ok: true, services: await listAdminServices() },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json({ ok: false, error: errorMessage(error) }, { status: 400 });
  }
}
