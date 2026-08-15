import { redirect } from "next/navigation";

export default async function ClientServiceBookingPage({ params, searchParams }: { params: Promise<{ serviceSlug: string }>; searchParams: Promise<{ partner?: string }> }) {
  const { serviceSlug } = await params;
  const query = await searchParams;
  const destination = new URLSearchParams({ service: serviceSlug });
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(query.partner || "")) {
    destination.set("partner", query.partner || "");
  }
  redirect(`/book?${destination.toString()}`);
}
