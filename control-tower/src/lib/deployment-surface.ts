export const DEPLOYMENT_SURFACES = [
  "combined",
  "partner-platform",
  "telahagocrecer",
] as const;

export type DeploymentSurface = (typeof DEPLOYMENT_SURFACES)[number];

export function deploymentSurface(): DeploymentSurface {
  const configured = process.env.DEPLOYMENT_SURFACE?.trim().toLowerCase();

  return DEPLOYMENT_SURFACES.includes(configured as DeploymentSurface)
    ? (configured as DeploymentSurface)
    : "combined";
}
