export const PHONE_COUNTRIES = [
  { code: "US", flag: "🇺🇸", name: "United States", dialCode: "+1", placeholder: "(555) 123-4567" },
  { code: "PR", flag: "🇵🇷", name: "Puerto Rico", dialCode: "+1", placeholder: "(787) 123-4567" },
  { code: "CA", flag: "🇨🇦", name: "Canada", dialCode: "+1", placeholder: "(416) 123-4567" },
] as const;

export type PhoneCountryCode = (typeof PHONE_COUNTRIES)[number]["code"];

const PUERTO_RICO_AREA_CODES = new Set(["787", "939"]);
const CANADA_AREA_CODES = new Set([
  "204", "226", "236", "249", "250", "257", "263", "289", "306", "343", "354", "365",
  "367", "368", "382", "403", "416", "418", "428", "431", "437", "438", "450", "468",
  "474", "506", "514", "519", "548", "568", "579", "581", "584", "587", "600", "604",
  "613", "639", "647", "672", "683", "705", "709", "742", "753", "778", "780", "782",
  "807", "819", "825", "867", "873", "879", "902", "905", "942",
]);

export function phoneCountry(value: string, fallback: PhoneCountryCode = "US"): PhoneCountryCode {
  const digits = value.replace(/\D/g, "");
  const hasExplicitDialCode = value.trim().startsWith("+") && digits.startsWith("1");
  const nationalDigits = hasExplicitDialCode || digits.length > 10 && digits.startsWith("1") ? digits.slice(1) : digits;
  const areaCode = nationalDigits.slice(0, 3);
  if (areaCode.length < 3) return fallback;
  if (PUERTO_RICO_AREA_CODES.has(areaCode)) return "PR";
  if (CANADA_AREA_CODES.has(areaCode)) return "CA";
  return "US";
}

export function phoneCountryOption(code: PhoneCountryCode) {
  return PHONE_COUNTRIES.find((country) => country.code === code) || PHONE_COUNTRIES[0];
}

export function nationalPhoneDigits(value: string, countryCode: PhoneCountryCode = "US") {
  const digits = value.replace(/\D/g, "");
  const dialDigits = phoneCountryOption(countryCode).dialCode.replace(/\D/g, "");
  const hasExplicitDialCode = value.trim().startsWith("+") && digits.startsWith(dialDigits);
  const hasStoredNanpValue = dialDigits === "1" && digits.length > 10 && digits.startsWith("1");
  return (hasExplicitDialCode || hasStoredNanpValue ? digits.slice(dialDigits.length) : digits).slice(0, 10);
}

export function formatPhone(value: string, countryCode: PhoneCountryCode = phoneCountry(value)) {
  const digits = nationalPhoneDigits(value, countryCode);
  if (!digits) return "";
  const area = digits.slice(0, 3);
  const prefix = digits.slice(3, 6);
  const line = digits.slice(6, 10);
  return `${area ? `(${area}${area.length === 3 ? ")" : ""}` : ""}${prefix ? ` ${prefix}` : ""}${line ? `-${line}` : ""}`.trim();
}

export function normalizePhone(value: string, countryCode: PhoneCountryCode = "US") {
  const digits = nationalPhoneDigits(value, countryCode);
  if (!digits) return "";
  return `${phoneCountryOption(countryCode).dialCode}${digits}`;
}

export function phoneIsComplete(value: string, countryCode: PhoneCountryCode = phoneCountry(value)) {
  return nationalPhoneDigits(value, countryCode).length === 10;
}
