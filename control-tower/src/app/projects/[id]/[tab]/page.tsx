import { redirect } from "next/navigation";
import ProjectWorkspaceClient from "../ProjectWorkspaceClient";

type TabPageProps = {
  params: Promise<{ id: string; tab: string }>;
};

const ALLOWED_TABS = new Set([
  "home",
  "run-center",
  "search-builder",
  "location-nav",
  "sheet-explorer",
  "project-details",
  "webhooks",
  "logs",
]);

export default async function ProjectTabPage({ params }: TabPageProps) {
  const { id, tab } = await params;
  const tenantId = String(id || "").trim();
  const tabSlug = String(tab || "").trim().toLowerCase();

  if (!tenantId) redirect("/");
  if (!ALLOWED_TABS.has(tabSlug)) {
    redirect(`/projects/${encodeURIComponent(tenantId)}/home`);
  }

  return <ProjectWorkspaceClient />;
}
