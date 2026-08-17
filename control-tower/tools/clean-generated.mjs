import { readdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const generatedPaths = [
  resolve(projectRoot, ".next"),
  resolve(projectRoot, ".turbo"),
  resolve(projectRoot, "tsconfig.tsbuildinfo"),
  resolve(projectRoot, "tsconfig.source-check.tsbuildinfo"),
  resolve(projectRoot, "storage"),
  resolve(projectRoot, "data/cache"),
];

for (const generatedPath of generatedPaths) {
  await rm(generatedPath, { recursive: true, force: true });
}

if (process.argv.includes("--deep")) {
  const docsDirectory = resolve(projectRoot, "docs");
  const docsEntries = await readdir(docsDirectory, { withFileTypes: true }).catch(
    () => [],
  );

  for (const entry of docsEntries) {
    if (!entry.name.startsWith("kate-")) continue;
    await rm(resolve(docsDirectory, entry.name), {
      recursive: true,
      force: true,
    });
  }
}

console.log(
  process.argv.includes("--deep")
    ? "Removed generated caches and ignored local media artifacts."
    : "Removed generated Next.js and TypeScript caches.",
);
