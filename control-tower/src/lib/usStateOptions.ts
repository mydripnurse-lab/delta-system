export const US_STATE_OPTIONS = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"],
  ["CA", "California"], ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"],
  ["DC", "District of Columbia"], ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"],
  ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"],
  ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"],
  ["MD", "Maryland"], ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"],
  ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"],
  ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"],
  ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"],
  ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"], ["PR", "Puerto Rico"],
  ["RI", "Rhode Island"], ["SC", "South Carolina"], ["SD", "South Dakota"], ["TN", "Tennessee"],
  ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"],
  ["WA", "Washington"], ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
] as const;

export type UsStateCode = (typeof US_STATE_OPTIONS)[number][0];

const NAME_BY_CODE = new Map<string, string>(US_STATE_OPTIONS);

const FIPS_BY_CODE = new Map<string, string>([
  ["AL", "01"], ["AK", "02"], ["AZ", "04"], ["AR", "05"], ["CA", "06"], ["CO", "08"],
  ["CT", "09"], ["DE", "10"], ["DC", "11"], ["FL", "12"], ["GA", "13"], ["HI", "15"],
  ["ID", "16"], ["IL", "17"], ["IN", "18"], ["IA", "19"], ["KS", "20"], ["KY", "21"],
  ["LA", "22"], ["ME", "23"], ["MD", "24"], ["MA", "25"], ["MI", "26"], ["MN", "27"],
  ["MS", "28"], ["MO", "29"], ["MT", "30"], ["NE", "31"], ["NV", "32"], ["NH", "33"],
  ["NJ", "34"], ["NM", "35"], ["NY", "36"], ["NC", "37"], ["ND", "38"], ["OH", "39"],
  ["OK", "40"], ["OR", "41"], ["PA", "42"], ["RI", "44"], ["SC", "45"], ["SD", "46"],
  ["TN", "47"], ["TX", "48"], ["UT", "49"], ["VT", "50"], ["VA", "51"], ["WA", "53"],
  ["WV", "54"], ["WI", "55"], ["WY", "56"], ["PR", "72"],
]);

export function normalizeStateCodes(input: unknown): UsStateCode[] {
  const values = Array.isArray(input) ? input : [];
  return [...new Set(values.map((value) => String(value || "").trim().toUpperCase()))]
    .filter((code): code is UsStateCode => NAME_BY_CODE.has(code));
}

export function stateNameForCode(code: string) {
  return NAME_BY_CODE.get(String(code || "").trim().toUpperCase()) || "";
}

export function stateFipsForCode(code: string) {
  return FIPS_BY_CODE.get(String(code || "").trim().toUpperCase()) || "";
}

const CODE_BY_NAME = new Map(US_STATE_OPTIONS.map(([code, name]) => [name.toLowerCase(), code]));

export function stateCodeForValue(value: unknown): UsStateCode | "" {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "";
  const code = normalized.toUpperCase();
  if (NAME_BY_CODE.has(code)) return code as UsStateCode;
  return CODE_BY_NAME.get(normalized.toLowerCase()) || "";
}

export function stateMatchesScope(value: unknown, stateCodes: readonly string[]) {
  if (!stateCodes.length) return true;
  const code = stateCodeForValue(value);
  return Boolean(code && stateCodes.some((stateCode) => stateCode.toUpperCase() === code));
}

export function stateScopeNames(stateCodes: readonly string[]) {
  return normalizeStateCodes([...stateCodes]).map((code) => stateNameForCode(code));
}
