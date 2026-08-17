import { rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

const args = new Set(process.argv.slice(2));
const isDryRun = args.has("--dry-run");
const isUnsafe = args.has("--unsafe");

const targets = [
  "node_modules",
  "control-tower/node_modules",
  "control-tower/.next",
  "control-tower/.turbo",
  "scripts/out",
  "control-tower/data/cache",
];

if (isUnsafe) {
  targets.push(
    "tmp",
    "storage",
    "states",
    "control-tower/storage",
  );
}

if (isUnsafe) {
  console.log("Unsafe mode enabled: also cleaning tmp/storage/states.");
}

function countTrackedFiles(target) {
  try {
    const raw = execSync(`git ls-files ${JSON.stringify(`${target}/`)} | wc -l`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const count = Number(raw);
    return Number.isFinite(count) ? count : 0;
  } catch {
    return 0;
  }
}

function isTrackedDirectory(target) {
  return countTrackedFiles(target) > 0;
}

console.log(isDryRun ? "repo:prune-runtime (dry-run)" : "repo:prune-runtime");

for (const target of targets) {
  const absolute = resolve(process.cwd(), target);
  if (!existsSync(absolute)) continue;

  let isDir = false;
  try {
    isDir = (await stat(absolute)).isDirectory();
  } catch {
    continue;
  }

  if (!isDir) continue;

  if (isDryRun) {
    if (isUnsafe && isTrackedDirectory(target)) {
      console.log(`SKIP preview: ${target} has tracked files; run git rm --cached ${target} first.`);
      continue;
    }
    console.log(`Would remove: ${target}`);
  } else {
    if (isUnsafe && isTrackedDirectory(target)) {
      console.log(`SKIP remove: ${target} (tracked files present). Run git rm --cached ${target} first to keep safety.`);
      continue;
    }
    await rm(absolute, { force: true, recursive: true });
    console.log(`Removed: ${target}`);
  }
}

if (!isDryRun) {
  console.log("Runtime cleanup complete.");
}
