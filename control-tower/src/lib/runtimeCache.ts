import path from "path";

function s(v: unknown) {
  return String(v ?? "").trim();
}

export function resolveCacheRootDir() {
  const configured = s(process.env.DASH_CACHE_DIR);
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.resolve(process.cwd(), configured);
  }

  if (s(process.env.VERCEL) === "1") {
    return path.join("/tmp", "control-tower-cache");
  }

  return path.join(process.cwd(), "data", "cache");
}

export function resolveTenantModuleCacheDir(tenantId: string, module: string) {
  const root = resolveCacheRootDir();
  const cleanModule = s(module) || "default";
  const cleanTenant = s(tenantId);
  return cleanTenant
    ? path.join(root, "tenants", cleanTenant, cleanModule)
    : path.join(root, cleanModule);
}

