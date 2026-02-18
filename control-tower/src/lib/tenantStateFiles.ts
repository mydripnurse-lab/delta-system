import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

type TenantStateFilesInput = {
  tenantId: string;
  rootDomain: string | null;
};

export type TenantStateFilesResult = {
  ok: boolean;
  outputDir: string;
  relativeOutputDir: string;
  generatedFiles: number;
  message: string;
  stdout: string;
  stderr: string;
};

function s(v: unknown) {
  return String(v ?? "").trim();
}

function resolveRootDomain(input: string | null) {
  return s(input).replace(/^https?:\/\//i, "").replace(/\/+$/g, "");
}

function existsSyncSafe(p: string) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function findRepoRoot(startDir: string) {
  let dir = startDir;
  for (let i = 0; i < 10; i += 1) {
    const hasScriptsBuilds = existsSyncSafe(path.join(dir, "scripts", "src", "builds"));
    const hasResources = existsSyncSafe(path.join(dir, "resources"));
    if (hasScriptsBuilds && hasResources) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}

export async function generateTenantStateFiles(
  input: TenantStateFilesInput,
): Promise<TenantStateFilesResult> {
  const tenantId = s(input.tenantId);
  const rootDomain = resolveRootDomain(input.rootDomain);
  if (!tenantId) throw new Error("Missing tenantId");
  if (!rootDomain) throw new Error("Missing rootDomain");

  const repoRoot = findRepoRoot(process.cwd());
  const relativeOutputDir = path.posix.join("resources", "tenants", tenantId, "statesFiles");
  const absoluteOutputDir = path.join(repoRoot, "resources", "tenants", tenantId, "statesFiles");
  const scriptPath = path.join(repoRoot, "scripts", "src", "builds", "generate-state-files-from-us-cities.js");

  const env = {
    ...process.env,
    STATE_FILES_ROOT_DOMAIN: rootDomain,
    STATE_FILES_OUT_DIR: relativeOutputDir,
  };

  const { code, stdout, stderr } = await new Promise<{
    code: number;
    stdout: string;
    stderr: string;
  }>((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], { cwd: repoRoot, env });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => {
      out += d.toString();
    });
    child.stderr.on("data", (d) => {
      err += d.toString();
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({ code: exitCode ?? 1, stdout: out.trim(), stderr: err.trim() });
    });
  });

  const generatedFiles = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("Generated ")).length;

  if (code !== 0) {
    return {
      ok: false,
      outputDir: absoluteOutputDir,
      relativeOutputDir,
      generatedFiles,
      message: `State files generation failed (exit=${code})`,
      stdout,
      stderr,
    };
  }

  return {
    ok: true,
    outputDir: absoluteOutputDir,
    relativeOutputDir,
    generatedFiles,
    message: `Generated tenant state files for ${rootDomain}`,
    stdout,
    stderr,
  };
}
