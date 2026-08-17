import { execSync } from "node:child_process";
import { join } from "node:path";
import { statSync } from "node:fs";

const repoRoot = process.cwd();

const dirsToTrack = [
  ".",
  "control-tower",
  "node_modules",
  "control-tower/node_modules",
  "control-tower/.next",
  "control-tower/.turbo",
  "tmp",
  "states",
  "storage",
  "routes",
  "public",
];

function formatBytes(bytes) {
  if (!bytes || Number.isNaN(bytes)) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let value = bytes;

  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }

  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function dirSizeBytes(path) {
  try {
    const stat = statSync(path);

    if (stat.isFile()) return stat.size;
    if (!stat.isDirectory()) return 0;

    const command = `du -sb ${JSON.stringify(path)}`;
    const out = execSync(command, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const value = Number(out.split(/\s+/)[0]);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function isDuplicateName(name) {
  return /(?:^|[\\/.\\s])[^\\/\\s]+\\s\\d+(?:\\.[^/.]+)?$/.test(name);
}

function topTracked() {
  const files = execSync("git ls-files -z", {
    encoding: "utf8",
  }).split("\0");

  const bigFiles = [];
  for (const file of files) {
    if (!file) continue;
    try {
      const size = statSync(file).size;
      if (size > 300 * 1024) {
        bigFiles.push({ file, size });
      }
    } catch {
      // ignored: file may disappear between commands or be inaccessible.
    }
  }

  bigFiles.sort((a, b) => b.size - a.size);
  return bigFiles.slice(0, 20);
}

function listUntrackedSuspicious() {
  const raw = execSync("git ls-files -o --exclude-standard -z", {
    encoding: "utf8",
  });
  const lines = raw
    .split("\0")
    .map((line) => line.trim())
    .filter(Boolean);

  const suspicious = [];
  for (const path of lines) {
    const base = path.split("/").pop();
    if (isDuplicateName(base)) suspicious.push(path);
  }

  return { suspicious, total: lines.length };
}

console.log("=== Repo health snapshot ===");
console.log(`Root: ${repoRoot}`);

for (const dir of dirsToTrack) {
  const fullPath = join(repoRoot, dir);
  const bytes = dirSizeBytes(fullPath);
  if (bytes > 0) {
    console.log(`${formatBytes(bytes).padEnd(10)} ${dir}`);
  }
}

const top = topTracked();
console.log("\\nTop 20 largest tracked files:");
for (const item of top) {
  console.log(`${formatBytes(item.size).padEnd(10)} ${item.file}`);
}

const untracked = listUntrackedSuspicious();
console.log(`\\nUntracked files: ${untracked.total}`);
if (untracked.suspicious.length > 0) {
  console.log("Files that look like accidental duplicates (\"name 2.ext\"):");
  for (const it of untracked.suspicious.slice(0, 25)) {
    console.log(` - ${it}`);
  }
}
