import { execSync } from "node:child_process";
import { statSync } from "node:fs";

function getRaw(cmd) {
  return execSync(cmd, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
}

function sizeFromBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

const trackedFiles = getRaw("git ls-files -z")
  .split("\0")
  .map((line) => line.trim())
  .filter(Boolean);

const trackedSummary = trackedFiles
  .map((file) => {
    try {
      const bytes = statSync(file).size;
      return { file, bytes };
    } catch {
      return null;
    }
  })
  .filter(Boolean)
  .filter((entry) => entry.bytes > 300_000)
  .sort((a, b) => b.bytes - a.bytes)
  .slice(0, 25);

if (trackedSummary.length > 0) {
  console.log("Tracked files over 300 KB:");
  for (const entry of trackedSummary) {
    console.log(` - ${sizeFromBytes(entry.bytes)}  ${entry.file}`);
  }
}

const runtimeCandidates = [
  "node_modules",
  "tmp",
  "storage",
  "states",
  "control-tower/node_modules",
  "control-tower/.next",
  "control-tower/.turbo",
  "control-tower/data/cache",
  "scripts/out",
];

const presentRuntime = [];
for (const dir of runtimeCandidates) {
  const isDir = getRaw(`test -d ${JSON.stringify(dir)} && echo yes || echo no`).trim() === "yes";
  if (isDir) {
    const size = getRaw(`du -sh ${JSON.stringify(dir)}`).split("\t")[0] || "0B";
    presentRuntime.push({ dir, size });
  }
}

if (presentRuntime.length > 0) {
  console.log("\nRuntime directories present:");
  for (const item of presentRuntime) {
    console.log(` - ${item.dir} (${item.size})`);
  }
}

const untracked = getRaw("git ls-files -o --exclude-standard -z")
  .split("\0")
  .map((line) => line.trim())
  .filter(Boolean);

const duplicates = untracked.filter((line) => /\s\d+\.[a-zA-Z0-9]+$/.test(line.trim()));
if (duplicates.length > 0) {
  console.log(`\nUntracked duplicates (\"name 2.ext\"): ${duplicates.length}`);
  for (const duplicate of duplicates.slice(0, 25)) {
    console.log(` - ${duplicate}`);
  }
}

console.log("\nRecomendación:");
if (presentRuntime.length > 0 || duplicates.length > 0) {
  console.log(" - Ejecuta `npm run repo:prune-runtime:dry-run` para revisar lo que se eliminaría.");
  console.log(" - Ejecuta `npm run repo:prune-runtime` para limpiar build/runtime.");
  console.log(" - Ejecuta `npm run repo:prune-runtime -- --unsafe` solo si los datos regenerables.");
} else {
  console.log(" - Tu árbol se ve limpio para continuar.");
}
