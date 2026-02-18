import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

type SheetTabIndexOptions = {
  spreadsheetId?: string;
  sheetName?: string;
  range?: string;
  logScope?: string;
  [key: string]: unknown;
};

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
    const hasServices = existsSyncSafe(path.join(dir, "services", "sheetsClient.js"));
    const hasScriptsBuilds = existsSyncSafe(path.join(dir, "scripts", "src", "builds"));
    if (hasServices && hasScriptsBuilds) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}

async function loadSheetsModule() {
  const repoRoot = findRepoRoot(process.cwd());
  const modulePath = path.join(repoRoot, "services", "sheetsClient.js");
  const moduleUrl = pathToFileURL(modulePath).href;
  return import(moduleUrl);
}

export async function loadSheetTabIndex(opts: SheetTabIndexOptions = {}) {
  const mod = await loadSheetsModule();
  if (typeof mod.loadSheetTabIndex !== "function") {
    throw new Error("loadSheetTabIndex is not available in services/sheetsClient.js");
  }
  return mod.loadSheetTabIndex(opts);
}
