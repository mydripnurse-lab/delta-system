// Exercise the real route with isolated authentication; no database or email calls.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
const require = createRequire(import.meta.url);
const { NextResponse } = require("next/server");
const source = readFileSync(new URL("../src/app/api/public/partner-portal/login/route.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
async function login(body, { partner = true, clinic = false, enabled = true, budget = true } = {}) {
  const calls = { partner: 0, clinic: 0 };
  const modules = {
    "next/server": { NextResponse },
    "@/lib/clinicFeature": { clinicsEnabled: () => enabled },
    "@/lib/clinicRequestBudget": { consumeClinicRequestBudget: () => budget },
    "@/lib/clinicAuth": {
      CLINIC_COOKIE: "clinic", clinicCookieOptions: () => ({ httpOnly: true }),
      loginClinicAccount: async () => { calls.clinic++; return clinic ? "clinic-test-token" : null; },
    },
    "@/lib/partnerPortalAuth": {
      PARTNER_PORTAL_COOKIE: "partner", partnerPortalCookieOptions: () => ({ httpOnly: true }),
      createPartnerPortalPasswordSession: async () => { calls.partner++; return partner ? { token: "partner-test-token" } : null; },
    },
  };
  const context = { exports: {}, require: name => { assert.ok(modules[name], name); return modules[name]; } };
  vm.runInNewContext(code, context);
  const response = await context.exports.POST(new Request("https://example.test/login", { method: "POST", body: JSON.stringify(body) }));
  return { response, payload: await response.json(), calls };
}
const nurse = await login({ role: "nurse" });
assert.equal(nurse.payload.redirectTo, "/portal");
assert.equal(nurse.calls.clinic, 0);
assert.equal(nurse.response.cookies.get("partner").value, "partner-test-token");
const owner = await login({ role: "clinic", returnTo: "/" });
assert.equal(owner.payload.redirectTo, "/portal/clinics");
assert.equal(owner.calls.clinic, 0);
assert.equal(owner.response.cookies.get("partner").value, "partner-test-token");
const clinic = await login({ role: "clinic" }, { partner: false, clinic: true });
assert.equal(clinic.payload.redirectTo, "/portal/clinics");
assert.equal(clinic.response.cookies.get("clinic").value, "clinic-test-token");
assert.equal(clinic.response.cookies.get("partner").value, "");
const wrongWorkspace = await login({ role: "nurse" }, { partner: false, clinic: true });
assert.equal(wrongWorkspace.response.status, 401);
assert.equal(wrongWorkspace.calls.clinic, 0);
assert.equal(wrongWorkspace.response.cookies.getAll().length, 0);
assert.equal((await login({ role: "clinic" }, { partner: false })).response.status, 401);
for (const [body, options, status] of [
  [{ role: "admin" }, {}, 400],
  [{ role: "clinic" }, { enabled: false }, 403],
  [{ role: "nurse" }, { budget: false }, 429],
]) {
  const result = await login(body, options);
  assert.equal(result.response.status, status);
  assert.deepEqual(result.calls, { partner: 0, clinic: 0 });
}
assert.equal((await login({ returnTo: "/" })).payload.redirectTo, "/");
assert.equal((await login({}, { partner: false, clinic: true })).payload.redirectTo, "/portal/clinics");
assert.equal((await login({ role: "nurse", returnTo: "https://attacker.test" })).payload.redirectTo, "/portal");
console.log("Partner login checks passed: workspace routing, cookies, legacy callers, validation and rate limits.");
