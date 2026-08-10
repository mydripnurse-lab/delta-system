import { redirect } from "next/navigation";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Partner Portal | My Drip Nurse",
  robots: { index: false, follow: false },
};

export default async function PortalAliasPage() {
  const host = (await headers()).get("host")?.split(":")[0].toLowerCase();
  if (process.env.NODE_ENV === "production" && host !== "partners.mydripnurse.com") {
    redirect("https://partners.mydripnurse.com/portal");
  }
  redirect("/partner-portal");
}
