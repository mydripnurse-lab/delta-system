import { rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const generatedPaths = [
  resolve(projectRoot, ".next"),
  resolve(projectRoot, ".turbo"),
  resolve(projectRoot, "tsconfig.tsbuildinfo"),
];

for (const generatedPath of generatedPaths) {
  await rm(generatedPath, { recursive: true, force: true });
}

console.log("Removed generated Next.js and TypeScript caches.");
