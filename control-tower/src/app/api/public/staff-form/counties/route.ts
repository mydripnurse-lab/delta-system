import { NextResponse } from "next/server";
import { getStaffFormConfig, loadEligibleCounties } from "@/lib/publicStaffProvisioning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function GET(req: Request) {
  try {
    const formKey = new URL(req.url).searchParams.get("formKey") || "";
    const config = await getStaffFormConfig(formKey);
    const rows = await loadEligibleCounties(config);
    const states = new Map<string, Array<{ key: string; county: string }>>();
    for (const row of rows) {
      if (!states.has(row.state)) states.set(row.state, []);
      states.get(row.state)!.push({ key: row.key, county: row.county });
    }
    return NextResponse.json(
      { states: [...states.entries()].map(([state, counties]) => ({ state, counties })) },
      { headers: { ...cors, "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load counties" },
      { status: 400, headers: cors },
    );
  }
}
