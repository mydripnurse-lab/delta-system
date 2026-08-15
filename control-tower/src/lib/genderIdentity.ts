export const GENDER_IDENTITY_VALUES = ["male", "female", "prefer_not_to_say"] as const;

export type GenderIdentity = (typeof GENDER_IDENTITY_VALUES)[number];

export const GENDER_IDENTITY_OPTIONS: ReadonlyArray<{ value: GenderIdentity; label: string }> = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

export function isGenderIdentity(value: unknown): value is GenderIdentity {
  return typeof value === "string" && GENDER_IDENTITY_VALUES.includes(value as GenderIdentity);
}

export function normalizeGenderIdentity(value: unknown): GenderIdentity | "" {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  return isGenderIdentity(normalized) ? normalized : "prefer_not_to_say";
}
