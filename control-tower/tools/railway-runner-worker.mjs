import fs from "fs";
import fsp from "fs/promises";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import readline from "readline";
import { createServer } from "http";
import { Pool } from "pg";

const PORT = Math.max(1, Number(process.env.PORT || 8080));
const WORKER_API_KEY = String(process.env.WORKER_API_KEY || process.env.RUNNER_WORKER_API_KEY || "").trim();
const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
const REPO_ROOT = String(process.env.RUNNER_REPO_ROOT || process.cwd()).trim();
const MAX_BODY_BYTES = Math.max(1024 * 16, Number(process.env.RUNNER_WORKER_MAX_BODY_BYTES || 1024 * 1024 * 2));

if (!DATABASE_URL) {
  throw new Error("Missing DATABASE_URL for railway-runner-worker.");
}

const pool = new Pool({ connectionString: DATABASE_URL });
const activeRuns = new Map();

function s(v) {
  return String(v ?? "").trim();
}

function exists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function findRepoRoots(startDir) {
  const out = [];
  const add = (p) => {
    const n = path.normalize(p);
    if (!out.includes(n)) out.push(n);
  };
  add(startDir);
  add(path.join(startDir, ".."));
  let dir = startDir;
  for (let i = 0; i < 10; i += 1) {
    add(dir);
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return out;
}

function resolveScriptPath(repoRoots, jobKey) {
  const pushIfExists = (candidates) => {
    for (const c of candidates) {
      const p = path.normalize(c);
      if (exists(p)) return p;
    }
    return null;
  };
  for (const root of repoRoots) {
    const buildsDir = path.join(root, "scripts", "src", "builds");
    const siblingBuildsDir = path.join(root, "..", "scripts", "src", "builds");
    const candidatesByJob = {
      "run-delta-system": [
        path.join(root, "scripts", "run-delta-system.js"),
        path.join(root, "..", "scripts", "run-delta-system.js"),
      ],
      "build-sheet-rows": [
        path.join(buildsDir, "build-sheets-counties-cities.js"),
        path.join(siblingBuildsDir, "build-sheets-counties-cities.js"),
        path.join(buildsDir, "build-sheet-rows.js"),
        path.join(siblingBuildsDir, "build-sheet-rows.js"),
      ],
      "build-counties": [
        path.join(buildsDir, "build-counties.js"),
        path.join(siblingBuildsDir, "build-counties.js"),
      ],
    };
    const hit = pushIfExists(candidatesByJob[jobKey] || []);
    if (hit) return hit;
  }
  return null;
}

function jobUsesState(job) {
  return job === "run-delta-system" || job === "build-sheet-rows" || job === "build-counties";
}

function makeScriptArgs(job, scriptPath, payload) {
  const mode = s(payload.mode) || "dry";
  const debug = payload.debug ? "1" : "0";
  const rawState = s(payload.state || "all");
  const args = [scriptPath, `--mode=${mode}`, `--debug=${debug}`];
  if (jobUsesState(job)) {
    args.push(`--state=${rawState}`);
    args.push(rawState);
  }
  const locId = s(payload.locId);
  const kind = s(payload.kind);
  if (locId) args.push(`--locId=${locId}`);
  if (kind) args.push(`--kind=${kind}`);
  return args;
}

async function upsertRunRow(payload) {
  const runId = s(payload.runId);
  await pool.query(
    `
      insert into app.runner_runs (
        run_id, tenant_id, job, state, mode, debug, loc_id, kind, status, created_at, updated_at
      ) values (
        $1, nullif($2,''), nullif($3,''), nullif($4,''), nullif($5,''), $6, nullif($7,''), nullif($8,''), 'running', now(), now()
      )
      on conflict (run_id) do update
        set tenant_id = excluded.tenant_id,
            job = excluded.job,
            state = excluded.state,
            mode = excluded.mode,
            debug = excluded.debug,
            loc_id = excluded.loc_id,
            kind = excluded.kind,
            status = 'running',
            updated_at = now()
    `,
    [
      runId,
      s(payload.tenantId),
      s(payload.job),
      s(payload.state),
      s(payload.mode),
      !!payload.debug,
      s(payload.locId),
      s(payload.kind),
    ],
  );
}

async function appendEvent(runId, message, eventType = "line", payload = null) {
  const msg = s(message);
  await pool.query(
    `insert into app.runner_run_events (run_id, event_type, message, payload) values ($1, $2, $3, $4::jsonb)`,
    [runId, eventType, msg, payload ? JSON.stringify(payload) : null],
  );
  await pool.query(
    `
      update app.runner_runs
         set updated_at = now(),
             last_line = $2,
             lines_count = (
               select count(*)::int from app.runner_run_events where run_id = $1
             )
       where run_id = $1
    `,
    [runId, msg],
  );
}

async function finishRun(runId, params) {
  const status = params.stopped ? "stopped" : params.error || (params.exitCode ?? 0) !== 0 ? "error" : "done";
  await pool.query(
    `
      update app.runner_runs
         set status = $2,
             stopped = $3,
             exit_code = $4,
             error = nullif($5,''),
             finished_at = now(),
             updated_at = now()
       where run_id = $1
    `,
    [runId, status, !!params.stopped, params.exitCode ?? null, s(params.error)],
  );
}

async function materializeTenantStateFilesFromDb(tenantId) {
  const q = await pool.query(
    `
      select state_slug, payload
      from app.organization_state_files
      where organization_id = $1
      order by state_slug asc
    `,
    [tenantId],
  );
  if (!q.rows.length) {
    throw new Error(`No state files found in DB for tenant ${tenantId}.`);
  }
  const dir = path.join(os.tmpdir(), `railway-state-files-${tenantId}-${Date.now()}`);
  await fsp.mkdir(dir, { recursive: true });
  for (const row of q.rows) {
    const slug = s(row.state_slug).toLowerCase();
    if (!slug) continue;
    await fsp.writeFile(path.join(dir, `${slug}.json`), JSON.stringify(row.payload || {}, null, 2), "utf8");
  }
  return { dir, count: q.rows.length };
}

async function runStep(runId, args) {
  const [scriptPath, ...rest] = args;
  const cmd = `node ${[scriptPath, ...rest].map((x) => JSON.stringify(x)).join(" ")}`;
  await appendEvent(runId, `worker-step: ${cmd}`);
}

async function runInWorker(payload) {
  const runId = s(payload.runId);
  const job = s(payload.job);
  const mode = s(payload.mode) || "dry";
  const debug = !!payload.debug;
  const state = s(payload.state || "all");
  const tenantId = s(payload.tenantId);
  const envOverrides = payload.env && typeof payload.env === "object" ? payload.env : {};
  const repoRoots = findRepoRoots(REPO_ROOT);
  const scriptPath = resolveScriptPath(repoRoots, job);
  if (!scriptPath) {
    throw new Error(`Script not found for job="${job}" from repoRoot=${REPO_ROOT}`);
  }

  const env = {
    ...process.env,
    ...envOverrides,
    MODE: mode,
    DEBUG: debug ? "1" : "0",
    TENANT_ID: tenantId,
  };

  let tempStateFilesDir = "";
  const tempOutRoot = path.join(
    os.tmpdir(),
    "ct-out",
    tenantId || "global",
    `${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
  );
  if (tenantId && jobUsesState(job)) {
    const seeded = await materializeTenantStateFilesFromDb(tenantId);
    tempStateFilesDir = seeded.dir;
    env.STATE_FILES_DIR = seeded.dir;
    await appendEvent(runId, `state-files source=db materialized=${seeded.count} dir=${seeded.dir}`);
  }
  await fsp.mkdir(tempOutRoot, { recursive: true });
  env.OUT_ROOT_DIR = tempOutRoot;
  await appendEvent(runId, `out-root dir=${tempOutRoot}`);

  const cleanup = async () => {
    if (tempStateFilesDir) await fsp.rm(tempStateFilesDir, { recursive: true, force: true }).catch(() => {});
    if (tempOutRoot) await fsp.rm(tempOutRoot, { recursive: true, force: true }).catch(() => {});
  };

  try {
    if (job === "run-delta-system") {
      const preCreateDb = resolveScriptPath(repoRoots, "build-sheet-rows");
      const preBuildCounties = resolveScriptPath(repoRoots, "build-counties");
      if (!preCreateDb || !preBuildCounties) {
        throw new Error("Missing prebuild scripts for run-delta-system.");
      }

      const createArgs = makeScriptArgs("build-sheet-rows", preCreateDb, { ...payload, state });
      await runStep(runId, createArgs);
      await spawnAndPipe(runId, createArgs, env, REPO_ROOT);

      const countiesArgs = makeScriptArgs("build-counties", preBuildCounties, { ...payload, state });
      await runStep(runId, countiesArgs);
      await spawnAndPipe(runId, countiesArgs, env, REPO_ROOT);
    }

    const mainArgs = makeScriptArgs(job, scriptPath, { ...payload, state });
    await appendEvent(runId, `cmd=node ${mainArgs.map((x) => JSON.stringify(x)).join(" ")}`);
    await spawnAndPipe(runId, mainArgs, env, REPO_ROOT, true);
    await finishRun(runId, { exitCode: 0, stopped: false, error: null });
  } catch (e) {
    await appendEvent(runId, `❌ ${e instanceof Error ? e.message : String(e)}`, "error");
    const active = activeRuns.get(runId);
    await finishRun(runId, {
      exitCode: active?.stopRequested ? 0 : 1,
      stopped: !!active?.stopRequested,
      error: active?.stopRequested ? null : e instanceof Error ? e.message : String(e),
    });
    throw e;
  } finally {
    activeRuns.delete(runId);
    await cleanup();
  }
}

async function spawnAndPipe(runId, args, env, cwd, trackStop = false) {
  const child = spawn(process.execPath, args, {
    cwd,
    env,
    stdio: ["pipe", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  if (trackStop) {
    activeRuns.set(runId, { child, stopRequested: false });
    await appendEvent(runId, `__RUN_PID__ ${String(child.pid || "")}`);
    await appendEvent(runId, `main: started child pid=${String(child.pid || "")}`);
  }
  const rlOut = readline.createInterface({ input: child.stdout });
  const rlErr = readline.createInterface({ input: child.stderr });
  rlOut.on("line", (line) => {
    void appendEvent(runId, line, line.startsWith("__PROGRESS") ? "progress" : "line");
  });
  rlErr.on("line", (line) => {
    void appendEvent(runId, line, line.startsWith("__PROGRESS") ? "progress" : "line");
  });
  const exitCode = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
  try {
    rlOut.close();
    rlErr.close();
  } catch {}
  if (Number(exitCode) !== 0) {
    throw new Error(`Process failed with exit code ${exitCode}.`);
  }
}

function requireAuth(req) {
  if (!WORKER_API_KEY) return true;
  const auth = s(req.headers.authorization).replace(/^Bearer\s+/i, "");
  const xApi = s(req.headers["x-api-key"]);
  return auth === WORKER_API_KEY || xApi === WORKER_API_KEY;
}

function json(res, code, body) {
  res.statusCode = code;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error(`Body too large (>${MAX_BODY_BYTES} bytes)`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

async function stopRunById(runId) {
  const active = activeRuns.get(runId);
  if (!active?.child) {
    await pool.query(
      `
        update app.runner_runs
           set stopped = true,
               status = 'stopped',
               updated_at = now()
         where run_id = $1
      `,
      [runId],
    );
    return { ok: true, stopped: false, reason: "not_active" };
  }
  active.stopRequested = true;
  await appendEvent(runId, "🛑 Stop requested (remote worker)");
  try {
    const pid = Number(active.child.pid || 0);
    if (pid > 0 && process.platform !== "win32") {
      try {
        process.kill(-pid, "SIGTERM");
      } catch {
        active.child.kill("SIGTERM");
      }
    } else {
      active.child.kill("SIGTERM");
    }
  } catch {}
  return { ok: true, stopped: true };
}

const server = createServer(async (req, res) => {
  const method = s(req.method).toUpperCase();
  const url = s(req.url).split("?")[0];

  if (method === "GET" && url === "/health") {
    return json(res, 200, { ok: true, service: "railway-runner-worker", ts: new Date().toISOString() });
  }
  if (!requireAuth(req)) {
    return json(res, 401, { ok: false, error: "Unauthorized" });
  }

  if (method === "POST" && url === "/run") {
    try {
      const body = await parseBody(req);
      const runId = s(body.runId);
      const job = s(body.job);
      if (!runId || !job) return json(res, 400, { ok: false, error: "Missing runId/job" });
      if (activeRuns.has(runId)) return json(res, 200, { ok: true, accepted: true, runId, duplicated: true });
      await upsertRunRow(body);
      await appendEvent(runId, `worker: accepted run ${runId} job=${job}`);
      void runInWorker(body).catch(() => {});
      return json(res, 200, { ok: true, accepted: true, runId });
    } catch (e) {
      return json(res, 500, { ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  if (method === "POST" && url === "/stop") {
    try {
      const body = await parseBody(req);
      const runId = s(body.runId);
      if (!runId) return json(res, 400, { ok: false, error: "Missing runId" });
      const out = await stopRunById(runId);
      return json(res, 200, { ok: true, runId, ...out });
    } catch (e) {
      return json(res, 500, { ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return json(res, 404, { ok: false, error: "Not found" });
});

server.listen(PORT, () => {
  console.log(`[railway-runner-worker] listening on :${PORT}`);
});
