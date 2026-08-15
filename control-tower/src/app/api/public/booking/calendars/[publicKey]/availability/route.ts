import { NextResponse } from "next/server";
import { z } from "zod";

import { loadBookingAvailability } from "@/lib/serviceBookingAvailability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }),
  state: z.string().trim().min(2).max(100),
  county: z.string().trim().min(2).max(120),
  city: z.string().trim().min(1).max(120),
  postalCode: z.string().trim().max(20).optional().default(""),
  partnerId: z.string().uuid().optional(),
  medicalScreening: z.literal("clear"),
});

const publicKeySchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120);

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ publicKey: string }> },
) {
  try {
    const { publicKey: rawPublicKey } = await context.params;
    const publicKey = publicKeySchema.parse(rawPublicKey);
    const url = new URL(request.url);
    const query = querySchema.parse({
      date: url.searchParams.get("date"),
      state: url.searchParams.get("state"),
      county: url.searchParams.get("county"),
      city: url.searchParams.get("city"),
      postalCode: url.searchParams.get("postalCode") || "",
      partnerId: url.searchParams.get("partnerId") || undefined,
      medicalScreening: url.searchParams.get("medicalScreening"),
    });
    const availability = await loadBookingAvailability({
      publicKey,
      date: query.date,
      coverage: query,
      requestedPartnerId: query.partnerId,
    });
    if (!availability) {
      return NextResponse.json(
        { error: "Calendar not found or not active." },
        { status: 404, headers: { ...cors, "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(availability, {
      headers: { ...cors, "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Complete the medical screening and enter a valid date, state, county and city." },
        { status: 400, headers: cors },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load availability." },
      { status: 500, headers: cors },
    );
  }
}
