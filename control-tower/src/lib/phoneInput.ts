export const PHONE_COUNTRIES = [
  { code: "US", flag: "🇺🇸", name: "United States", dialCode: "+1", placeholder: "(555) 123-4567" },
  { code: "PR", flag: "🇵🇷", name: "Puerto Rico", dialCode: "+1", placeholder: "(787) 123-4567" },
  { code: "CA", flag: "🇨🇦", name: "Canada", dialCode: "+1", placeholder: "(416) 123-4567" },
] as const;

export type PhoneCountryCode = (typeof PHONE_COUNTRIES)[number]["code"];

export function phoneCountry(value: string, fallback: PhoneCountryCode = "US"): PhoneCountryCode {
  const digits = value.replace(/\D/g, "");
  if (/^(?:1)?(?:787|939)/.test(digits)) return "PR";
  return fallback;
}

export function phoneCountryOption(code: PhoneCountryCode) {
  return PHONE_COUNTRIES.find((country) => country.code === code) || PHONE_COUNTRIES[0];
}

export function nationalPhoneDigits(value: string) {
  const digits = value.replace(/\D/g, "");
  return (digits.length > 10 && digits.startsWith("1") ? digits.slice(1) : digits).slice(0, 10);
}

export function formatPhone(value: string) {
  const digits = nationalPhoneDigits(value);
  if (!digits) return "";
  const area = digits.slice(0, 3);
  const prefix = digits.slice(3, 6);
  const line = digits.slice(6, 10);
  return `${area ? `(${area}${area.length === 3 ? ")" : ""}` : ""}${prefix ? ` ${prefix}` : ""}${line ? `-${line}` : ""}`.trim();
}

export function normalizePhone(value: string, countryCode: PhoneCountryCode = "US") {
  const digits = nationalPhoneDigits(value);
  if (!digits) return "";
  return `${phoneCountryOption(countryCode).dialCode}${digits}`;
}

export function phoneIsComplete(value: string) {
  return nationalPhoneDigits(value).length === 10;
}
