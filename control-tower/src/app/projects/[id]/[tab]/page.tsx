import { notFound } from "next/navigation";

import ProjectWorkspaceClient from "../ProjectWorkspaceClient";

type PageProps = {
  params: Promise<{ id: string; tab: string }>;
};

const PROJECT_TABS = new Set([
  "home",
  "run-center",
  "search-builder",
  "solar-survey",
  "location-nav",
  "sheet-explorer",
  "project-details",
  "integrations",
  "webhooks",
  "logs",
  "prompts",
]);

export default async function ProjectTabPage({ params }: PageProps) {
  const { id, tab } = await params;
  const tenantId = String(id || "").trim();
  const projectTab = String(tab || "").trim().toLowerCase();

  if (!tenantId || !PROJECT_TABS.has(projectTab)) notFound();

  return <ProjectWorkspaceClient />;
}
