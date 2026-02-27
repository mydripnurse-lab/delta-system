import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProjectRootPage({ params }: PageProps) {
  const { id } = await params;
  const tenantId = String(id || "").trim();
  if (!tenantId) redirect("/");
  redirect(`/projects/${encodeURIComponent(tenantId)}/home`);
}
