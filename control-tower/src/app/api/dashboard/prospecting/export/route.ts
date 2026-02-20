import { readLeadStore } from "@/lib/prospectingStore";

export const runtime = "nodejs";

function s(v: unknown) {
  return String(v ?? "").trim();
}

function csvCell(v: unknown) {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const tenantId = s(url.searchParams.get("tenantId"));
    if (!tenantId) {
      return Response.json({ ok: false, error: "Missing tenantId" }, { status: 400 });
    }
    const contactableOnly = s(url.searchParams.get("contactableOnly")) !== "0";
    const statusFilter = s(url.searchParams.get("status"));

    const store = await readLeadStore(tenantId);
    let rows = [...store.leads];
    if (statusFilter) {
      rows = rows.filter((x) => s(x.status).toLowerCase() === statusFilter.toLowerCase());
    }
    if (contactableOnly) {
      rows = rows.filter((x) => Boolean(s(x.email) || s(x.phone)));
    }

    const header = [
      "business_name",
      "website",
      "email",
      "phone",
      "category",
      "services",
      "state",
      "county",
      "city",
      "status",
      "source",
      "notes",
      "created_at",
      "updated_at",
    ];
    const csv = [
      header.join(","),
      ...rows.map((r) =>
        [
          csvCell(r.businessName),
          csvCell(r.website),
          csvCell(r.email),
          csvCell(r.phone),
          csvCell(r.category),
          csvCell(r.services),
          csvCell(r.state),
          csvCell(r.county),
          csvCell(r.city),
          csvCell(r.status),
          csvCell(r.source),
          csvCell(r.notes),
          csvCell(r.createdAt),
          csvCell(r.updatedAt),
        ].join(","),
      ),
    ].join("\n");

    return new Response(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="prospecting_leads_${tenantId}.csv"`,
      },
    });
  } catch (e: unknown) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to export leads" },
      { status: 500 },
    );
  }
}
