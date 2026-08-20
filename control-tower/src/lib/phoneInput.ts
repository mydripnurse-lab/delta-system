export const PHONE_COUNTRY_DIAL_CODES = {
  AF: "+93", AL: "+355", DZ: "+213", AS: "+1", AD: "+376", AO: "+244", AI: "+1", AG: "+1", AR: "+54", AM: "+374", AW: "+297", AU: "+61", AT: "+43", AZ: "+994",
  BS: "+1", BH: "+973", BD: "+880", BB: "+1", BY: "+375", BE: "+32", BZ: "+501", BJ: "+229", BM: "+1", BT: "+975", BO: "+591", BA: "+387", BW: "+267", BR: "+55", IO: "+246", VG: "+1", BN: "+673", BG: "+359", BF: "+226", BI: "+257",
  KH: "+855", CM: "+237", CA: "+1", CV: "+238", KY: "+1", CF: "+236", TD: "+235", CL: "+56", CN: "+86", CO: "+57", KM: "+269", CG: "+242", CD: "+243", CK: "+682", CR: "+506", CI: "+225", HR: "+385", CU: "+53", CW: "+599", CY: "+357", CZ: "+420",
  DK: "+45", DJ: "+253", DM: "+1", DO: "+1", EC: "+593", EG: "+20", SV: "+503", GQ: "+240", ER: "+291", EE: "+372", SZ: "+268", ET: "+251", FK: "+500", FO: "+298", FJ: "+679", FI: "+358", FR: "+33", GF: "+594", PF: "+689", GA: "+241", GM: "+220", GE: "+995", DE: "+49", GH: "+233", GI: "+350", GR: "+30", GL: "+299", GD: "+1", GP: "+590", GU: "+1", GT: "+502", GG: "+44", GN: "+224", GW: "+245", GY: "+592",
  HT: "+509", HN: "+504", HK: "+852", HU: "+36", IS: "+354", IN: "+91", ID: "+62", IR: "+98", IQ: "+964", IE: "+353", IM: "+44", IL: "+972", IT: "+39", JM: "+1", JP: "+81", JE: "+44", JO: "+962", KZ: "+7", KE: "+254", KI: "+686", KP: "+850", KR: "+82", KW: "+965", KG: "+996",
  LA: "+856", LV: "+371", LB: "+961", LS: "+266", LR: "+231", LY: "+218", LI: "+423", LT: "+370", LU: "+352", MO: "+853", MG: "+261", MW: "+265", MY: "+60", MV: "+960", ML: "+223", MT: "+356", MH: "+692", MQ: "+596", MR: "+222", MU: "+230", YT: "+262", MX: "+52", FM: "+691", MD: "+373", MC: "+377", MN: "+976", ME: "+382", MS: "+1", MA: "+212", MZ: "+258", MM: "+95",
  NA: "+264", NR: "+674", NP: "+977", NL: "+31", NC: "+687", NZ: "+64", NI: "+505", NE: "+227", NG: "+234", NU: "+683", NF: "+672", MK: "+389", MP: "+1", NO: "+47", OM: "+968", PK: "+92", PW: "+680", PS: "+970", PA: "+507", PG: "+675", PY: "+595", PE: "+51", PH: "+63", PL: "+48", PT: "+351",
  PR: "+1", QA: "+974", RE: "+262", RO: "+40", RU: "+7", RW: "+250", BL: "+590", SH: "+290", KN: "+1", LC: "+1", MF: "+590", PM: "+508", VC: "+1", WS: "+685", SM: "+378", ST: "+239", SA: "+966", SN: "+221", RS: "+381", SC: "+248", SL: "+232", SG: "+65", SX: "+1", SK: "+421", SI: "+386", SB: "+677", SO: "+252", ZA: "+27", SS: "+211", ES: "+34", LK: "+94", SD: "+249", SR: "+597", SJ: "+47", SE: "+46", CH: "+41", SY: "+963",
  TW: "+886", TJ: "+992", TZ: "+255", TH: "+66", TL: "+670", TG: "+228", TK: "+690", TO: "+676", TT: "+1", TN: "+216", TR: "+90", TM: "+993", TC: "+1", TV: "+688", UG: "+256", UA: "+380", AE: "+971", GB: "+44", US: "+1", UY: "+598", UZ: "+998", VU: "+678", VA: "+39", VE: "+58", VN: "+84", VI: "+1", WF: "+681", EH: "+212", YE: "+967", ZM: "+260", ZW: "+263",
} as const;

export type PhoneCountryCode = keyof typeof PHONE_COUNTRY_DIAL_CODES;

const NANP_COUNTRY_BY_AREA_CODE: Partial<Record<string, PhoneCountryCode>> = {
  "242": "BS", "246": "BB", "264": "AI", "268": "AG", "284": "VG", "340": "VI", "345": "KY",
  "441": "BM", "473": "GD", "649": "TC", "658": "JM", "664": "MS", "670": "MP", "671": "GU",
  "684": "AS", "721": "SX", "758": "LC", "767": "DM", "784": "VC", "787": "PR", "809": "DO",
  "829": "DO", "849": "DO", "868": "TT", "869": "KN", "876": "JM", "939": "PR",
};
const CANADA_AREA_CODES = new Set([
  "204", "226", "236", "249", "250", "257", "263", "289", "306", "343", "354", "365",
  "367", "368", "382", "403", "416", "418", "428", "431", "437", "438", "450", "468",
  "474", "506", "514", "519", "548", "568", "579", "581", "584", "587", "600", "604",
  "613", "639", "647", "672", "683", "705", "709", "742", "753", "778", "780", "782",
  "807", "819", "825", "867", "873", "879", "902", "905", "942",
]);

const PREFERRED_COUNTRY_BY_DIAL_CODE: Partial<Record<string, PhoneCountryCode>> = {
  "1": "US", "7": "RU", "39": "IT", "44": "GB", "47": "NO", "52": "MX", "55": "BR",
  "262": "RE", "290": "SH", "358": "FI", "590": "GP", "599": "CW", "672": "NF", "970": "PS",
};

function countryFlag(code: PhoneCountryCode) {
  return code.replace(/./g, (letter) => String.fromCodePoint(127397 + letter.charCodeAt(0)));
}

const countryNames = typeof Intl.DisplayNames === "function"
  ? new Intl.DisplayNames(["en"], { type: "region" })
  : null;

export const PHONE_COUNTRIES = (Object.entries(PHONE_COUNTRY_DIAL_CODES) as Array<[PhoneCountryCode, string]>)
  .map(([code, dialCode]) => ({
    code,
    dialCode,
    flag: countryFlag(code),
    name: countryNames?.of(code) || code,
    placeholder: code === "US" || code === "CA" || code === "PR"
      ? "(555) 123-4567"
      : code === "MX" ? "55 1234 5678" : "Phone number",
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

function nanpCountry(digits: string, fallback: PhoneCountryCode) {
  const areaCode = digits.slice(0, 3);
  if (areaCode.length < 3) return fallback;
  if (NANP_COUNTRY_BY_AREA_CODE[areaCode]) return NANP_COUNTRY_BY_AREA_CODE[areaCode]!;
  if (CANADA_AREA_CODES.has(areaCode)) return "CA";
  return PHONE_COUNTRY_DIAL_CODES[fallback] === "+1" ? fallback : "US";
}

export function phoneCountry(value: string, fallback: PhoneCountryCode = "US"): PhoneCountryCode {
  const digits = value.replace(/\D/g, "");
  if (value.trim().startsWith("+")) {
    const matched = PHONE_COUNTRIES
      .filter((country) => digits.startsWith(country.dialCode.slice(1)))
      .sort((a, b) => b.dialCode.length - a.dialCode.length)[0];
    if (!matched) return fallback;
    if (matched.dialCode === "+1") return nanpCountry(digits.slice(1), fallback);
    if (PHONE_COUNTRY_DIAL_CODES[fallback] === matched.dialCode) return fallback;
    return PREFERRED_COUNTRY_BY_DIAL_CODE[matched.dialCode.slice(1)] || matched.code;
  }

  const nationalNanpDigits = digits.length > 10 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (PHONE_COUNTRY_DIAL_CODES[fallback] === "+1" || digits.length === 10 || digits.length === 11 && digits.startsWith("1")) {
    return nanpCountry(nationalNanpDigits, fallback);
  }
  return fallback;
}

export function hasRecognizedDialCode(value: string) {
  if (!value.trim().startsWith("+")) return false;
  const digits = value.replace(/\D/g, "");
  return PHONE_COUNTRIES.some((country) => digits.startsWith(country.dialCode.slice(1)));
}

export function phoneCountryOption(code: PhoneCountryCode) {
  return PHONE_COUNTRIES.find((country) => country.code === code) || PHONE_COUNTRIES.find((country) => country.code === "US")!;
}

export function nationalPhoneDigits(value: string, countryCode: PhoneCountryCode = "US") {
  const digits = value.replace(/\D/g, "");
  const dialDigits = phoneCountryOption(countryCode).dialCode.slice(1);
  const hasExplicitDialCode = value.trim().startsWith("+") && digits.startsWith(dialDigits);
  const hasStoredNanpValue = dialDigits === "1" && digits.length > 10 && digits.startsWith("1");
  return (hasExplicitDialCode || hasStoredNanpValue ? digits.slice(dialDigits.length) : digits).slice(0, 15);
}

export function formatPhone(value: string, countryCode: PhoneCountryCode = phoneCountry(value)) {
  const digits = nationalPhoneDigits(value, countryCode);
  if (!digits) return "";
  if (countryCode === "US" || countryCode === "CA" || countryCode === "PR") {
    const area = digits.slice(0, 3);
    const prefix = digits.slice(3, 6);
    const line = digits.slice(6, 10);
    return `${area ? `(${area}${area.length === 3 ? ")" : ""}` : ""}${prefix ? ` ${prefix}` : ""}${line ? `-${line}` : ""}`.trim();
  }
  if (countryCode === "MX") {
    return [digits.slice(0, 2), digits.slice(2, 6), digits.slice(6, 10)].filter(Boolean).join(" ");
  }
  return digits.match(/.{1,3}/g)?.join(" ") || "";
}

export function normalizePhone(value: string, countryCode: PhoneCountryCode = phoneCountry(value)) {
  const digits = nationalPhoneDigits(value, countryCode);
  if (!digits) return "";
  return `${phoneCountryOption(countryCode).dialCode}${digits}`;
}

export function phoneIsComplete(value: string, countryCode: PhoneCountryCode = phoneCountry(value)) {
  const digits = nationalPhoneDigits(value, countryCode);
  if (countryCode === "US" || countryCode === "CA" || countryCode === "PR" || countryCode === "MX") return digits.length === 10;
  return digits.length >= 6 && digits.length <= 15;
}
