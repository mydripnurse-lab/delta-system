import { NextResponse } from "next/server";
import { z } from "zod";

import { saveBookingDemand } from "@/lib/appointmentBooking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const schema = z.object({
  publicKey: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
  customer: z.object({
    fullName: z.string().trim().min(2).max(160),
    email: z.string().trim().email().max(254),
    phone: z.string().trim().min(7).max(30),
  }),
  address: z.object({
    addressLine1: z.string().trim().max(200).default(""),
    addressLine2: z.string().trim().max(200).optional().default(""),
    city: z.string().trim().min(1).max(120),
    county: z.string().trim().min(2).max(120),
    state: z.string().trim().min(2).max(100),
    postalCode: z.string().trim().max(20).optional().default(""),
    countryCode: z.string().trim().length(2).optional().default("US"),
  }),
  sourceUrl: z.string().trim().url().max(2000).optional(),
});

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const demandRequestId = await saveBookingDemand(input);
    if (!demandRequestId) throw new Error("The service calendar was not found.");
    return NextResponse.json(
      { ok: true, demandRequestId },
      { status: 201, headers: { ...cors, "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Name, email, phone and service area are required." }, { status: 400, headers: cors });
    }
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "The coverage request could not be saved." },
      { status: 400, headers: cors },
    );
  }
}
