function normalizeName(x: unknown) {
  return String(x ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export const LEGACY_DYNAMIC_CUSTOM_VALUE_NAMES = [
  "Business - County Domain",
  "Business - County Name",
  "County Name And State",
  "Website Url",
];

const LEGACY_DYNAMIC_NAME_SET = new Set(
  LEGACY_DYNAMIC_CUSTOM_VALUE_NAMES.map((x) => normalizeName(x)),
);

export function isLegacyDynamicCustomValueName(name: unknown) {
  return LEGACY_DYNAMIC_NAME_SET.has(normalizeName(name));
}

export function normalizeCustomValueName(name: unknown) {
  return normalizeName(name);
}
