import type { Metadata } from "next";

import { BookingCalendarClient } from "@/components/booking/BookingCalendarClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Book Mobile IV Therapy | My Drip Nurse",
  icons: { icon: "https://sitemaps.mydripnurse.com/favicon.ico" },
};

export default async function BookingCalendarPage({
  params,
}: {
  params: Promise<{ publicKey: string }>;
}) {
  const { publicKey } = await params;
  return <BookingCalendarClient publicKey={publicKey} />;
}
