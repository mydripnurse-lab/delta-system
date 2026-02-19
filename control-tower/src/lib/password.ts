import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb);

const KEY_LENGTH = 64;

function s(v: unknown) {
  return String(v ?? "").trim();
}

export function validatePasswordStrength(password: string) {
  const p = s(password);
  if (p.length < 10) return "Password must be at least 10 characters.";
  if (!/[A-Z]/.test(p)) return "Password must include at least one uppercase letter.";
  if (!/[a-z]/.test(p)) return "Password must include at least one lowercase letter.";
  if (!/[0-9]/.test(p)) return "Password must include at least one number.";
  return "";
}

export async function hashPassword(password: string): Promise<string> {
  const p = s(password);
  if (!p) throw new Error("Missing password");
  const salt = randomBytes(16).toString("base64url");
  const derived = (await scrypt(p, salt, KEY_LENGTH)) as Buffer;
  return `scrypt$${salt}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const p = s(password);
  const value = s(encoded);
  if (!p || !value) return false;
  const parts = value.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = parts[1] || "";
  const hash = parts[2] || "";
  if (!salt || !hash) return false;
  const derived = (await scrypt(p, salt, KEY_LENGTH)) as Buffer;
  const target = Buffer.from(hash, "base64url");
  if (derived.length !== target.length) return false;
  return timingSafeEqual(derived, target);
}

