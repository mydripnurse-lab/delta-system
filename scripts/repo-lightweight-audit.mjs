import { execSync } from "node:child_process";
import { statSync } from "node:fs";

const args = new Set(process.argv.slice(2));
const showJson = args.has("--json");

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

const heavyTrackedCmd = "git ls-files -z";
const tracked = execSync(heavyTrackedCmd, { encoding: "utf8" })
  .split("\0")
  .map((line) => line.trim())
  .filter(Boolean);

const dirStats = new Map();
const pairStats = new Map();
const extensionStats = new Map();
const largeTracked = [];

let totalSize = 0;
let totalFiles = 0;

for (const file of tracked) {
  try {
    const stat = statSync(file);
    if (!stat.isFile()) continue;

    const size = stat.size;
    totalSize += size;
    totalFiles += 1;

    const parts = file.split("/");
    const top = parts[0] || "<root>";
    const pair = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : top;

    dirStats.set(top, (dirStats.get(top) || 0) + size);
    pairStats.set(pair, (pairStats.get(pair) || 0) + size);

    const fileName = parts.at(-1);
    const extIdx = fileName.lastIndexOf(".");
    const ext = extIdx >= 0 ? fileName.slice(extIdx + 1).toLowerCase() : "<noext>";
    extensionStats.set(ext, (extensionStats.get(ext) || 0) + 1);

    if (size > 300 * 1024) {
      largeTracked.push({ file, size });
    }
  } catch {
    // ignore removed or inaccessible files
  }
}

largeTracked.sort((a, b) => b.size - a.size);

const candidateRuntimeTracked = [
  "states/",
  "tmp/",
  "storage/",
  "resources/tenants/",
  "resources/statesFiles/",
  "public/audio/",
];

const runtimeTracked = {};
for (const file of tracked) {
  for (const candidate of candidateRuntimeTracked) {
    if (!file.startsWith(candidate)) continue;
    const state = runtimeTracked[candidate] || { files: 0, bytes: 0 };
    try {
      state.bytes += statSync(file).size;
      state.files += 1;
    } catch {
      state.files += 1;
    }
    runtimeTracked[candidate] = state;
  }
}

const topDirs = [...dirStats.entries()]
  .map(([name, bytes]) => ({ name, bytes, files: 0 }))
  .sort((a, b) => b.bytes - a.bytes);

for (const file of tracked) {
  try {
    const stat = statSync(file);
    if (!stat.isFile()) continue;
    const top = file.split("/")[0] || "<root>";
    const match = topDirs.find((d) => d.name === top);
    if (match) match.files += 1;
  } catch {
    // ignore
  }
}

const topPairDirs = [...pairStats.entries()]
  .map(([name, bytes]) => ({ name, bytes }))
  .sort((a, b) => b.bytes - a.bytes);

const topExtensions = [...extensionStats.entries()]
  .map(([ext, count]) => ({ ext, count }))
  .sort((a, b) => b.count - a.count)
  .slice(0, 20);

const output = {
  summary: {
    trackedFiles: totalFiles,
    trackedBytes: totalSize,
    trackedMB: Number((totalSize / (1024 * 1024)).toFixed(2)),
  },
  topLevelDirs: topDirs,
  topTwoLevelDirs: topPairDirs,
  runtimeTracked,
  extensionCounts: topExtensions,
  topLargeFiles: largeTracked.slice(0, 40).map((entry) => ({
    file: entry.file,
    size: entry.size,
    sizeMB: Number((entry.size / (1024 * 1024)).toFixed(2)),
  })),
};

if (showJson) {
  console.log(JSON.stringify(output, null, 2));
  process.exit(0);
}

console.log("=== Repo lightweight audit ===");
console.log(`Tracked files: ${output.summary.trackedFiles}`);
console.log(`Tracked size: ${formatBytes(totalSize)}\n`);

console.log("Top tracked top-level folders by size:");
for (const row of topDirs.slice(0, 16)) {
  console.log(` - ${row.name}: ${formatBytes(row.bytes)} (${row.files} archivos)`);
}

console.log("\nTop 2-level folders by size:");
for (const row of topPairDirs.slice(0, 20)) {
  console.log(` - ${row.name}: ${formatBytes(row.bytes)}`);
}

console.log("\nRuntime/derived folders tracked:");
for (const [name, stat] of Object.entries(runtimeTracked)) {
  console.log(` - ${name} => ${stat.files} archivos, ${formatBytes(stat.bytes)}`);
}

console.log("\nTop 40 tracked files > 300 KB:");
for (const entry of output.topLargeFiles) {
  if (entry.size <= 300 * 1024) break;
  console.log(` - ${formatBytes(entry.size)} ${entry.file}`);
}

console.log("\nTop extensions by file count:");
for (const ext of topExtensions) {
  console.log(` - .${ext.ext}: ${ext.count}`);
}

console.log("\nNotas:");
console.log(" - Si quieres reducir ruido en Git, candidatos de migración: states/, resources/tenants/, tmp/, storage/");
console.log(" - Mantener control de regeneración automática antes de moverlos fuera del historial principal.");
