"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import styles from "@/components/booking/bookingCalendar.module.css";
import { GENDER_IDENTITY_OPTIONS, normalizeGenderIdentity } from "@/lib/genderIdentity";
import type { BookingAvailability, BookingAvailabilitySlot } from "@/lib/serviceBookingAvailability";

const PHONE_COUNTRY_DIAL_CODES = {
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

type PhoneCountryCode = keyof typeof PHONE_COUNTRY_DIAL_CODES;
type Contact = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  phoneCountry: PhoneCountryCode;
  dateOfBirth: string;
  weight: string;
  heightFeet: string;
  heightInches: string;
  genderIdentity: string;
};
type AdditionalPatient = Contact & { id: string };
type Address = {
  addressLine1: string;
  addressLine2: string;
  city: string;
  county: string;
  state: string;
  postalCode: string;
  countryCode: string;
  longitude?: number;
  latitude?: number;
};
type AddressSuggestion = {
  id: string;
  label: string;
  addressLine1: string;
  city: string;
  county: string;
  state: string;
  postalCode: string;
  countryCode: string;
  longitude: number;
  latitude: number;
};

export type BookingInitialProfile = {
  fullName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  county: string;
  state: string;
  postalCode: string;
  countryCode: string;
  addressVerifiedLabel: string;
  weightPounds: number | null;
  heightInchesTotal: number | null;
  genderIdentity: string;
  accountConnected?: boolean;
  screeningSelections?: string[];
  savedAddresses?: Array<{
    id: string;
    label: string;
    addressLine1: string;
    addressLine2: string;
    city: string;
    county: string;
    state: string;
    postalCode: string;
    countryCode: string;
    mapboxFeatureId: string;
    verifiedLabel: string;
    longitude: number;
    latitude: number;
    isDefault: boolean;
  }>;
};

type PublicAppointmentConfirmation = {
  reference: string;
  status: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  service: string;
  servicePrice: number;
  depositAmount: number;
  currency: string;
  paymentStatus: string;
  patient: { name: string; email: string; phone: string };
  hasAdditionalPatients: boolean;
  additionalPatientsCount: number;
  location: {
    addressLine1: string;
    addressLine2: string;
    city: string;
    county: string;
    state: string;
    postalCode: string;
    countryCode: string;
  };
};

type EmbeddedCheckoutState = {
  clientSecret: string;
  publishableKey: string;
  publicReference: string;
  sessionId?: string;
};

type PaymentReturnState = { publicReference: string; sessionId?: string };
type EmbeddedCheckout = { mount: (target: string | HTMLElement) => void; destroy: () => void };
type StripeInstance = {
  initEmbeddedCheckout: (options: { clientSecret: string; onComplete?: () => void }) => Promise<EmbeddedCheckout>;
};

declare global {
  interface Window {
    Stripe?: (publishableKey: string) => StripeInstance;
  }
}

let stripeScriptPromise: Promise<void> | null = null;

function loadStripeScript() {
  if (typeof window === "undefined" || window.Stripe) return Promise.resolve();
  if (stripeScriptPromise) return stripeScriptPromise;
  stripeScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://js.stripe.com/v3/"]');
    const script = existing || document.createElement("script");
    const onLoad = () => resolve();
    const onError = () => reject(new Error("Secure payment could not be loaded. Please try again."));
    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
    if (!existing) {
      script.src = "https://js.stripe.com/v3/";
      script.async = true;
      document.head.appendChild(script);
    }
  });
  return stripeScriptPromise;
}

function formatConfirmationDate(value: string, timezone: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: timezone,
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatConfirmationMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: (currency || "USD").toUpperCase(),
  }).format(amount);
}

function confirmationAddress(location: PublicAppointmentConfirmation["location"]) {
  return [
    location.addressLine1,
    location.addressLine2,
    location.city,
    location.county,
    location.state,
    location.postalCode,
  ].filter(Boolean).join(", ");
}

const MEDICAL_SCREENING_OPTIONS = [
  { id: "chf", label: "I have been diagnosed with or told I have congestive heart failure (CHF)" },
  { id: "hemophilia", label: "I have been diagnosed with or told I have hemophilia" },
  { id: "kidney-failure", label: "I have been diagnosed with or told I have kidney/renal failure or chronic kidney disease (CKD)" },
  { id: "dialysis", label: "I am on dialysis" },
  { id: "pah", label: "I have been diagnosed with or told I have pulmonary arterial hypertension (PAH)" },
  { id: "uncontrolled-bleeding", label: "I have a history of uncontrolled bleeding" },
  { id: "consent-impairment", label: "I have an impairment preventing myself from making medical decisions and/or consenting to my treatment" },
  { id: "fluid-buildup", label: "I currently have fluid build up in my feet, legs, or abdomen" },
  { id: "diuretic", label: "I take medicine(s) for fluid retention (i.e. diuretic)" },
  { id: "none", label: "None of these" },
] as const;

function countryFlag(code: PhoneCountryCode) {
  return code.replace(/./g, (letter) => String.fromCodePoint(127397 + letter.charCodeAt(0)));
}

const countryNames = typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames(["en"], { type: "region" }) : null;
const PHONE_COUNTRIES: Array<{ code: PhoneCountryCode; flag: string; name: string; dialCode: string; placeholder: string }> = Object.entries(PHONE_COUNTRY_DIAL_CODES)
  .map(([code, dialCode]) => {
    const countryCode = code as PhoneCountryCode;
    const placeholder = countryCode === "US" || countryCode === "CA" || countryCode === "PR"
      ? "(555) 123-4567"
      : countryCode === "MX" ? "55 1234 5678" : "Phone number";
    return { code: countryCode, flag: countryFlag(countryCode), name: countryNames?.of(countryCode) || countryCode, dialCode, placeholder };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

const PREFERRED_COUNTRY_BY_DIAL_CODE: Record<string, PhoneCountryCode> = {
  "1": "US", "7": "RU", "39": "IT", "44": "GB", "47": "NO", "52": "MX", "55": "BR", "262": "RE", "290": "SH", "358": "FI", "590": "GP", "599": "CW", "672": "NF", "970": "PS",
};

const emptyContact: Contact = { firstName: "", lastName: "", email: "", phone: "", phoneCountry: "US", dateOfBirth: "", weight: "", heightFeet: "", heightInches: "", genderIdentity: "" };
const emptyAddress: Address = {
  addressLine1: "",
  addressLine2: "",
  city: "",
  county: "",
  state: "",
  postalCode: "",
  countryCode: "US",
};

function todayDate() {
  const date = new Date();
  return date.toISOString().slice(0, 10);
}

function formatTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(value));
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "MDN";
}

function fullName(person: Contact) {
  return `${person.firstName} ${person.lastName}`.trim();
}

function newAdditionalPatient(): AdditionalPatient {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, ...emptyContact };
}

function getPhoneCountry(value: string): PhoneCountryCode {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("52")) return "MX";
  if (digits.startsWith("1787") || digits.startsWith("1939")) return "PR";
  const matched = PHONE_COUNTRIES
    .filter((country) => digits.startsWith(country.dialCode.replace("+", "")))
    .sort((a, b) => b.dialCode.length - a.dialCode.length)[0];
  if (!matched || matched.dialCode === "+1") return "US";
  return PREFERRED_COUNTRY_BY_DIAL_CODE[matched.dialCode.slice(1)] || matched.code;
}

function nationalPhoneDigits(value: string, countryCode: PhoneCountryCode) {
  const country = PHONE_COUNTRIES.find((item) => item.code === countryCode) || PHONE_COUNTRIES[0];
  const digits = value.replace(/\D/g, "");
  const dialDigits = country.dialCode.replace("+", "");
  const hasInternationalPrefix = value.trim().startsWith("+") || digits.length > (countryCode === "US" || countryCode === "CA" || countryCode === "PR" || countryCode === "MX" ? 10 : 12);
  return (hasInternationalPrefix && digits.startsWith(dialDigits) ? digits.slice(dialDigits.length) : digits).slice(0, 15);
}

function formatPhone(value: string, countryCode: PhoneCountryCode) {
  const digits = nationalPhoneDigits(value, countryCode);
  if (!digits) return "";
  if (countryCode === "MX") {
    const first = digits.slice(0, 2);
    const second = digits.slice(2, 6);
    const third = digits.slice(6, 10);
    return [first, second, third].filter(Boolean).join(" ");
  }
  if (countryCode === "US" || countryCode === "CA" || countryCode === "PR") {
    const area = digits.slice(0, 3);
    const prefix = digits.slice(3, 6);
    const line = digits.slice(6, 10);
    return `${area ? `(${area}${area.length === 3 ? ")" : ""}` : ""}${prefix ? ` ${prefix}` : ""}${line ? `-${line}` : ""}`.trim();
  }
  return digits.match(/.{1,3}/g)?.join(" ") || "";
}

function phoneForSubmission(person: Contact) {
  const country = PHONE_COUNTRIES.find((item) => item.code === person.phoneCountry) || PHONE_COUNTRIES[0];
  return `${country.dialCode}${nationalPhoneDigits(person.phone, person.phoneCountry)}`;
}

function phoneForDisplay(person: Contact) {
  const country = PHONE_COUNTRIES.find((item) => item.code === person.phoneCountry) || PHONE_COUNTRIES[0];
  return `${country.flag} ${country.dialCode} ${person.phone}`.trim();
}

function totalHeightInches(person: Pick<Contact, "heightFeet" | "heightInches">) {
  const feet = Number(person.heightFeet);
  const inches = Number(person.heightInches);
  if (!Number.isInteger(feet) || !Number.isInteger(inches)) return null;
  if (feet < 1 || feet > 8 || inches < 0 || inches > 11) return null;
  return feet * 12 + inches;
}

function weightIsComplete(value: string) {
  const weight = Number(value);
  return value.trim() !== "" && Number.isFinite(weight) && weight >= 1 && weight <= 1000;
}

function heightIsComplete(person: Pick<Contact, "heightFeet" | "heightInches">) {
  return totalHeightInches(person) !== null;
}

function normalizedPerson(person: Contact) {
  return {
    firstName: person.firstName,
    lastName: person.lastName,
    email: person.email,
    phone: phoneForSubmission(person),
    dateOfBirth: person.dateOfBirth,
    weight: person.weight,
    height: String(totalHeightInches(person) || ""),
    genderIdentity: normalizeGenderIdentity(person.genderIdentity),
  };
}

function PhoneField({
  value,
  countryCode,
  onCountryChange,
  onChange,
  autoComplete,
}: {
  value: string;
  countryCode: PhoneCountryCode;
  onCountryChange: (value: PhoneCountryCode) => void;
  onChange: (value: string) => void;
  autoComplete?: string;
}) {
  const country = PHONE_COUNTRIES.find((item) => item.code === countryCode) || PHONE_COUNTRIES[0];
  return (
    <label className={styles.phoneField}>
      <span>Phone</span>
      <div className={styles.phoneControl}>
        <select
          className={styles.countrySelect}
          value={country.code}
          aria-label="Phone country or region"
          onChange={(event) => onCountryChange(event.target.value as PhoneCountryCode)}
        >
          {PHONE_COUNTRIES.map((item) => <option value={item.code} key={item.code} aria-label={`${item.name} ${item.dialCode}`}>{item.flag} ({item.dialCode})</option>)}
        </select>
        <input
          type="tel"
          value={value}
          onChange={(event) => onChange(formatPhone(event.target.value, country.code))}
          placeholder={country.placeholder}
          inputMode="tel"
          autoComplete={autoComplete}
          aria-label={`${country.name} phone number`}
        />
      </div>
    </label>
  );
}

export function BookingCalendarClient({ publicKey, partnerId = "", partnerView = false, initialProfile, onMacroStepChange }: { publicKey: string; partnerId?: string; partnerView?: boolean; initialProfile?: BookingInitialProfile; onMacroStepChange?: (step: 2 | 3) => void }) {
  const initialPhone = initialProfile?.phone || "";
  const initialPhoneCountry = getPhoneCountry(initialPhone);
  const [contact, setContact] = useState<Contact>(() => ({
    ...emptyContact,
    firstName: (initialProfile?.fullName || "").trim().split(/\s+/)[0] || "",
    lastName: (initialProfile?.fullName || "").trim().split(/\s+/).slice(1).join(" "),
    email: initialProfile?.email || "",
    phone: formatPhone(initialPhone, initialPhoneCountry),
    phoneCountry: initialPhoneCountry,
    dateOfBirth: initialProfile?.dateOfBirth || "",
    weight: initialProfile?.weightPounds ? String(initialProfile.weightPounds) : "",
    heightFeet: initialProfile?.heightInchesTotal ? String(Math.floor(initialProfile.heightInchesTotal / 12)) : "",
    heightInches: initialProfile?.heightInchesTotal ? String(initialProfile.heightInchesTotal % 12) : "",
    genderIdentity: normalizeGenderIdentity(initialProfile?.genderIdentity),
  }));
  const [additionalPatients, setAdditionalPatients] = useState<AdditionalPatient[]>([]);
  const [contactSubmitted, setContactSubmitted] = useState(false);
  const [patientDetailsExpanded, setPatientDetailsExpanded] = useState(!initialProfile);
  const [address, setAddress] = useState<Address>(() => {
    const savedDefault = initialProfile?.savedAddresses?.find((item) => item.isDefault);
    return {
      ...emptyAddress,
      addressLine1: initialProfile?.addressLine1 || "",
      addressLine2: initialProfile?.addressLine2 || "",
      city: initialProfile?.city || "",
      county: initialProfile?.county || "",
      state: initialProfile?.state || "",
      postalCode: initialProfile?.postalCode || "",
      countryCode: initialProfile?.countryCode || "US",
      longitude: savedDefault?.longitude,
      latitude: savedDefault?.latitude,
    };
  });
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [addressSearchBusy, setAddressSearchBusy] = useState(false);
  const [addressSuggestionsOpen, setAddressSuggestionsOpen] = useState(false);
  const [addressVerifiedLabel, setAddressVerifiedLabel] = useState(initialProfile?.addressVerifiedLabel || "");
  const [addressFeatureId, setAddressFeatureId] = useState(() => initialProfile?.savedAddresses?.find((item) => item.isDefault)?.mapboxFeatureId || "");
  const [savedAddresses] = useState(() => initialProfile?.savedAddresses || []);
  const [selectedSavedAddressId, setSelectedSavedAddressId] = useState(() => initialProfile?.savedAddresses?.find((item) => item.isDefault)?.id || "");
  const [saveNewAddress, setSaveNewAddress] = useState(false);
  const [newAddressLabel, setNewAddressLabel] = useState("Home");
  const [addressSaved, setAddressSaved] = useState(false);
  const [date, setDate] = useState(todayDate);
  const [availability, setAvailability] = useState<BookingAvailability | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<BookingAvailabilitySlot | null>(null);
  const [selectedPartnerId, setSelectedPartnerId] = useState("");
  const [loading, setLoading] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const savedScreeningSelections = initialProfile?.screeningSelections || [];
  const [screeningSelected, setScreeningSelected] = useState<string[]>(savedScreeningSelections);
  const [screeningSubmitted, setScreeningSubmitted] = useState(false);
  const hasSavedScreening = savedScreeningSelections.length > 0;
  const [showFullScreening, setShowFullScreening] = useState(!hasSavedScreening);
  const leadCaptureAttemptedRef = useRef(false);
  const leadCaptureKeyRef = useRef("");
  const [sourceContext, setSourceContext] = useState<{ pageUrl: string; referrer: string; attribution: Record<string, string>; requestedPartnerId: string; directoryAttribution: { source: "partner_directory"; partnerProfileId: string; attributedAt: string } | null }>({ pageUrl: "", referrer: "", attribution: {}, requestedPartnerId: "", directoryAttribution: null });
  const embeddedCheckoutRef = useRef<EmbeddedCheckout | null>(null);
  const [checkoutState, setCheckoutState] = useState<EmbeddedCheckoutState | null>(null);
  const [checkoutMountAttempt, setCheckoutMountAttempt] = useState(0);
  const [paymentReturn, setPaymentReturn] = useState<PaymentReturnState | null>(null);
  const [confirmation, setConfirmation] = useState<PublicAppointmentConfirmation | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<"idle" | "processing" | "ready" | "error">("idle");
  const [paymentError, setPaymentError] = useState("");

  const finalizeCheckout = useCallback(async (publicReference: string, sessionId?: string) => {
    setPaymentStatus("processing");
    setPaymentError("");
    try {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const response = await fetch("/api/public/booking/checkout/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ appointment: publicReference, sessionId }),
        });
        const payload = await response.json();
        if (response.status === 409 && attempt < 5) {
          await new Promise((resolve) => window.setTimeout(resolve, 900));
          continue;
        }
        if (!response.ok || !payload.ok) throw new Error(payload.error || "Your payment could not be confirmed yet.");
        setConfirmation(payload.confirmation as PublicAppointmentConfirmation);
        setCheckoutState(null);
        setPaymentReturn(null);
        setPaymentStatus("ready");
        window.history.replaceState({}, "", `${window.location.pathname}${window.location.hash}`);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      throw new Error("Your payment is still processing. Please try again in a moment.");
    } catch (checkoutError) {
      setPaymentStatus("error");
      setPaymentError(checkoutError instanceof Error ? checkoutError.message : "Your payment could not be confirmed yet.");
    }
  }, []);

  const screeningIsClear = screeningSubmitted
    && screeningSelected.length === 1
    && screeningSelected[0] === "none";

  useEffect(() => {
    onMacroStepChange?.(selectedSlot && screeningIsClear ? 3 : 2);
  }, [onMacroStepChange, screeningIsClear, selectedSlot]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const returnedAppointment = params.get("appointment") || "";
    if (params.get("payment") === "return" && returnedAppointment) {
      setPaymentReturn({
        publicReference: returnedAppointment,
        sessionId: params.get("session_id") || undefined,
      });
    }
    const originalPageUrl = window.location.href;
    const referrer = document.referrer;
    const attribution = Object.fromEntries([...params.entries()].filter(([key]) => key.startsWith("utm_") || ["gclid", "fbclid", "ref", "source"].includes(key)).slice(0, 30));
    const requestedPartnerId = params.get("partnerId") || params.get("partner") || "";
    let directoryAttribution: { source: "partner_directory"; partnerProfileId: string; attributedAt: string } | null = null;
    try {
      const stored = JSON.parse(window.sessionStorage.getItem("mdn:directory-attribution") || "null") as { partnerId?: string; at?: number } | null;
      if (stored?.partnerId && stored.at && Date.now() - stored.at <= 24 * 60 * 60 * 1000 && (!partnerId || stored.partnerId === partnerId)) {
        directoryAttribution = { source: "partner_directory", partnerProfileId: stored.partnerId, attributedAt: new Date(stored.at).toISOString() };
      }
    } catch { /* attribution must never interrupt booking */ }
    setSourceContext({ pageUrl: originalPageUrl, referrer, attribution, requestedPartnerId, directoryAttribution });
    const initialPhone = params.get("phone") || initialProfile?.phone || "";
    const initialPhoneCountry = getPhoneCountry(initialPhone);
    const initialName = params.get("fullName") || params.get("name") || initialProfile?.fullName || "";
    setContact({
      firstName: (params.get("firstName") || initialName).trim().split(/\s+/)[0] || "",
      lastName: (params.get("lastName") || initialName).trim().split(/\s+/).slice(1).join(" "),
      email: params.get("email") || initialProfile?.email || "",
      phone: formatPhone(initialPhone, initialPhoneCountry),
      phoneCountry: initialPhoneCountry,
      dateOfBirth: params.get("dateOfBirth") || params.get("dob") || initialProfile?.dateOfBirth || "",
      weight: params.get("weight") || (initialProfile?.weightPounds ? String(initialProfile.weightPounds) : ""),
      heightFeet: params.get("heightFeet") || (params.get("height") ? String(Math.floor(Number(params.get("height")) / 12)) : initialProfile?.heightInchesTotal ? String(Math.floor(initialProfile.heightInchesTotal / 12)) : ""),
      heightInches: params.get("heightInches") || (params.get("height") ? String(Number(params.get("height")) % 12) : initialProfile?.heightInchesTotal ? String(initialProfile.heightInchesTotal % 12) : ""),
      genderIdentity: normalizeGenderIdentity(params.get("genderIdentity") || initialProfile?.genderIdentity),
    });
    setAddress((current) => ({
      ...current,
      addressLine1: params.get("address") || params.get("addressLine1") || initialProfile?.addressLine1 || "",
      addressLine2: params.get("addressLine2") || initialProfile?.addressLine2 || "",
      city: params.get("city") || initialProfile?.city || "",
      county: params.get("county") || initialProfile?.county || "",
      state: params.get("state") || initialProfile?.state || "",
      postalCode: params.get("postalCode") || params.get("zip") || initialProfile?.postalCode || "",
      countryCode: initialProfile?.countryCode || current.countryCode,
    }));
    const cleanUrl = `${window.location.pathname}${window.location.hash}`;
    window.history.replaceState({}, "", cleanUrl);
  }, [initialProfile, partnerId]);

  useEffect(() => {
    if (!paymentReturn) return;
    void finalizeCheckout(paymentReturn.publicReference, paymentReturn.sessionId);
  }, [finalizeCheckout, paymentReturn]);

  useEffect(() => {
    if (!checkoutState) return;
    let cancelled = false;
    setPaymentError("");
    void loadStripeScript().then(async () => {
      const stripe = window.Stripe?.(checkoutState.publishableKey);
      if (!stripe) throw new Error("Secure payment could not be initialized. Please try again.");
      const checkout = await stripe.initEmbeddedCheckout({
        clientSecret: checkoutState.clientSecret,
        onComplete: () => void finalizeCheckout(checkoutState.publicReference, checkoutState.sessionId),
      });
      if (cancelled) {
        checkout.destroy();
        return;
      }
      embeddedCheckoutRef.current = checkout;
      checkout.mount("#mdn-embedded-checkout");
    }).catch((checkoutError) => {
      if (cancelled) return;
      setPaymentStatus("error");
      setPaymentError(checkoutError instanceof Error ? checkoutError.message : "Secure payment could not be loaded.");
    });
    return () => {
      cancelled = true;
      embeddedCheckoutRef.current?.destroy();
      embeddedCheckoutRef.current = null;
    };
  }, [checkoutMountAttempt, checkoutState, finalizeCheckout]);

  useEffect(() => {
    const query = address.addressLine1.trim();
    const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim() || "";
    if (!token || query.length < 4 || addressVerifiedLabel) {
      setAddressSuggestions([]);
      setAddressSearchBusy(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setAddressSearchBusy(true);
      try {
        const searchContext = [query, address.city, address.state, address.postalCode].filter(Boolean).join(", ");
        const response = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchContext)}.json?autocomplete=true&limit=5&types=address&country=us,pr&language=en&access_token=${encodeURIComponent(token)}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Address search unavailable");
        const payload = await response.json() as { features?: Array<{ id?: string; text?: string; address?: string; place_name?: string; center?: [number, number]; context?: Array<{ id?: string; text?: string; short_code?: string }>; properties?: { short_code?: string } }> };
        const suggestions = (payload.features || []).map((feature): AddressSuggestion | null => {
          const context = feature.context || [];
          const contextText = (prefixes: string[]) => context.find((item) => prefixes.some((prefix) => item.id?.startsWith(prefix)))?.text || "";
          const region = context.find((item) => item.id?.startsWith("region"));
          const country = context.find((item) => item.id?.startsWith("country"));
          const addressLine1 = [feature.address, feature.text].filter(Boolean).join(" ");
          const [longitude, latitude] = feature.center || [];
          if (!feature.id || !addressLine1 || !Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
          return { id: feature.id, label: feature.place_name || addressLine1, addressLine1, city: contextText(["place", "locality", "municipality"]), county: contextText(["district", "county"]), state: region?.text || "", postalCode: contextText(["postcode"]), countryCode: (country?.short_code || "US").toUpperCase(), longitude, latitude };
        }).filter((suggestion): suggestion is AddressSuggestion => Boolean(suggestion));
        setAddressSuggestions(suggestions);
        setAddressSuggestionsOpen(Boolean(suggestions.length));
      } catch (searchError) {
        if (!(searchError instanceof DOMException && searchError.name === "AbortError")) setAddressSuggestions([]);
      } finally { setAddressSearchBusy(false); }
    }, 280);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [address.addressLine1, address.city, address.postalCode, address.state, addressVerifiedLabel]);

  function chooseAddressSuggestion(suggestion: AddressSuggestion) {
    setAddress((current) => ({ ...current, addressLine1: suggestion.addressLine1, city: suggestion.city || current.city, county: suggestion.county || current.county, state: suggestion.state || current.state, postalCode: suggestion.postalCode || current.postalCode, countryCode: suggestion.countryCode || "US", longitude: suggestion.longitude, latitude: suggestion.latitude }));
    setAddressVerifiedLabel(suggestion.label);
    setAddressFeatureId(suggestion.id);
    setSelectedSavedAddressId("");
    setAddressSaved(false);
    setAddressSuggestions([]);
    setAddressSuggestionsOpen(false);
    setAvailability(null);
    setSelectedSlot(null);
  }

  function chooseSavedAddress(id: string) {
    setSelectedSavedAddressId(id);
    const selected = savedAddresses.find((item) => item.id === id);
    if (!selected) {
      setAddress(emptyAddress);
      setAddressVerifiedLabel("");
      setAddressFeatureId("");
    } else {
      setAddress({
        addressLine1: selected.addressLine1,
        addressLine2: selected.addressLine2,
        city: selected.city,
        county: selected.county,
        state: selected.state,
        postalCode: selected.postalCode,
        countryCode: selected.countryCode,
        longitude: selected.longitude,
        latitude: selected.latitude,
      });
      setAddressVerifiedLabel(selected.verifiedLabel);
      setAddressFeatureId(selected.mapboxFeatureId);
    }
    setAvailability(null);
    setSelectedSlot(null);
  }

  const persistScreening = useCallback(async (selections: string[]) => {
    if (!initialProfile?.accountConnected) return;
    await fetch("/api/client-account/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "medical_screening", screeningSelections: selections }),
    }).catch(() => undefined);
  }, [initialProfile?.accountConnected]);

  function confirmSavedScreening() {
    if (!screeningSelected.length) {
      setError("Review your saved safety answers, or update them before continuing.");
      setShowFullScreening(true);
      return;
    }
    setScreeningSubmitted(true);
    setShowFullScreening(false);
    setError("");
    if (contactIsComplete && additionalPatients.length === 0) {
      setContactSubmitted(true);
      setPatientDetailsExpanded(false);
    }
    setNotice("Safety answers confirmed for today. Continue with your appointment details.");
    void persistScreening(screeningSelected);
  }

  function addAdditionalPatient() {
    setAdditionalPatients((current) => [...current, newAdditionalPatient()]);
    setError("");
    window.requestAnimationFrame(() => {
      document.getElementById("booking-additional-patients")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  const captureLead = useCallback(async (verifiedAddress: Address, available: BookingAvailability | null) => {
    if (leadCaptureAttemptedRef.current) return;
    leadCaptureAttemptedRef.current = true;
    if (!leadCaptureKeyRef.current) {
      leadCaptureKeyRef.current = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    }
    const eligiblePartners = [...new Map((available?.slots || []).flatMap((slot) => slot.partners).map((partner) => [partner.id, partner])).values()];
    try {
      await fetch("/api/public/booking/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicKey,
          idempotencyKey: leadCaptureKeyRef.current,
          requestedDate: date,
          timezone: available?.slots?.[0]?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
          requestedPartnerId: partnerId || sourceContext.requestedPartnerId || undefined,
          customer: normalizedPerson(contact),
          attendees: additionalPatients.map((patient) => normalizedPerson(patient)),
          address: verifiedAddress,
          medicalScreening: { selected: screeningSelected, noneSelected: screeningIsClear, completedAt: new Date().toISOString() },
          sourceUrl: sourceContext.pageUrl || sourceContext.referrer || window.location.origin,
          pageUrl: sourceContext.pageUrl || window.location.href,
          referrer: sourceContext.referrer || undefined,
          attribution: sourceContext.attribution,
          eligiblePartners,
          availabilityDiagnostics: {
            availabilityChecked: available !== null,
            coverageAvailable: available?.coverageAvailable ?? null,
            availableSlotCount: available?.slots?.length || 0,
          },
        }),
        cache: "no-store",
      });
    } catch (leadError) {
      // The event is intentionally not retried in the browser. The server
      // reserves the idempotency key before delivery to guarantee at-most-once.
      console.warn("Lead capture request could not be completed.", leadError);
    }
  }, [additionalPatients, contact, date, partnerId, publicKey, screeningIsClear, screeningSelected, sourceContext]);

  const contactIsComplete = useMemo(() => (
    Boolean(contact.firstName.trim() && contact.lastName.trim() && contact.email.trim() && contact.phone.trim() && contact.dateOfBirth && weightIsComplete(contact.weight) && heightIsComplete(contact) && contact.genderIdentity)
  ), [contact]);

  const additionalPatientsAreComplete = useMemo(() => additionalPatients.every((patient) => (
    patient.firstName.trim() && patient.lastName.trim() && patient.email.trim() && patient.phone.trim() && patient.dateOfBirth && weightIsComplete(patient.weight) && heightIsComplete(patient) && patient.genderIdentity
  )), [additionalPatients]);

  const canSearch = useMemo(() => (
    Boolean(contactSubmitted && date && address.addressLine1 && address.city && address.state && address.postalCode)
  ), [address, contactSubmitted, date]);

  const geocodeAddress = useCallback(async () => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim() || "";
    if (!token) throw new Error("The appointment address cannot be verified right now. Please contact My Drip Nurse support.");
    const query = [address.addressLine1, address.addressLine2, address.city, address.state, address.postalCode, address.countryCode].filter(Boolean).join(", ");
    const response = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?autocomplete=false&limit=1&types=address,place,postcode&access_token=${encodeURIComponent(token)}`, { cache: "no-store" });
    if (!response.ok) throw new Error("We could not verify that appointment address.");
    const payload = await response.json() as { features?: Array<{ place_name?: string; text?: string; center?: [number, number]; context?: Array<{ id?: string; text?: string }> }> };
    const feature = payload.features?.[0];
    const context = feature?.context || [];
    const contextText = (prefixes: string[]) => context.find((item) => prefixes.some((prefix) => item.id?.startsWith(prefix)))?.text || "";
    const county = contextText(["district", "county"]);
    const city = contextText(["place", "locality", "municipality"]) || address.city;
    const state = contextText(["region"]) || address.state;
    const postalCode = contextText(["postcode"]) || address.postalCode;
    const [longitude, latitude] = feature?.center || [];
    if (!feature || !county || !city || !state || !postalCode || !Number.isFinite(longitude) || !Number.isFinite(latitude)) throw new Error("We could not verify the county for that address. Check the street, city, state and ZIP code.");
    setAddress((current) => ({ ...current, county, city, state, postalCode, longitude, latitude }));
    return { county, city, state, postalCode, longitude, latitude };
  }, [address]);

  const saveAddressToCareProfile = useCallback(async () => {
    if (!initialProfile?.accountConnected || !saveNewAddress || !addressFeatureId || addressSaved || selectedSavedAddressId) return;
    const response = await fetch("/api/client-account/addresses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        label: newAddressLabel,
        addressLine1: address.addressLine1,
        addressLine2: address.addressLine2,
        city: address.city,
        state: address.state,
        postalCode: address.postalCode,
        countryCode: address.countryCode,
        addressFeatureId,
        isDefault: savedAddresses.length === 0,
      }),
    });
    if (response.ok) setAddressSaved(true);
  }, [address, addressFeatureId, addressSaved, initialProfile?.accountConnected, newAddressLabel, saveNewAddress, savedAddresses.length, selectedSavedAddressId]);

  const loadAvailability = useCallback(async () => {
    if (!canSearch) {
      setError("Enter the appointment city, state and ZIP code so we can confirm local availability.");
      return;
    }
    setLoading(true);
    setGeocoding(true);
    setError("");
    setNotice("");
    setAvailability(null);
    setSelectedSlot(null);
    setSelectedPartnerId("");
    try {
      const verifiedAddress = await geocodeAddress();
      await saveAddressToCareProfile().catch(() => undefined);
      if (!screeningIsClear) {
        await captureLead({ ...address, ...verifiedAddress }, null);
        setNotice("Your information was received. Online booking is unavailable when one or more screening conditions apply; please contact a qualified healthcare professional.");
        return;
      }
      const query = new URLSearchParams({
        date,
        city: verifiedAddress.city,
        county: verifiedAddress.county,
        state: verifiedAddress.state,
        postalCode: verifiedAddress.postalCode,
        latitude: String(verifiedAddress.latitude),
        longitude: String(verifiedAddress.longitude),
        medicalScreening: "clear",
      });
      if (partnerId) query.set("partnerId", partnerId);
      const response = await fetch(`/api/public/booking/calendars/${encodeURIComponent(publicKey)}/availability?${query}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Availability could not be loaded.");
      await captureLead({ ...address, ...verifiedAddress }, payload as BookingAvailability);
      setAvailability(payload);
      if (!payload.coverageAvailable) setNotice(partnerView ? "This service is not currently available in this area. Submit your request below so My Drip Nurse can track local demand." : "No Partner currently covers this service area. Submit your request below so My Drip Nurse can track local demand.");
      else if (!payload.slots?.length) setNotice(partnerView ? "This area is covered, but no times are open on this date. Try another day." : "Partners cover this area, but no times are open on this date. Try another day.");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Availability could not be loaded.");
    } finally {
      setGeocoding(false);
      setLoading(false);
    }
  }, [address, canSearch, captureLead, date, geocodeAddress, partnerId, partnerView, publicKey, saveAddressToCareProfile, screeningIsClear]);

  const continueToLocation = useCallback(() => {
    if (!contactIsComplete) {
      setError("Complete the primary patient’s contact, date of birth and wellness details.");
      return;
    }
    if (!additionalPatientsAreComplete) {
      setError("Complete every field for each additional patient, or remove the unfinished patient.");
      return;
    }
    setContactSubmitted(true);
    setPatientDetailsExpanded(false);
    setError("");
    setNotice("Your details are saved for this booking. Enter the appointment location to see live times.");
  }, [additionalPatientsAreComplete, contactIsComplete]);

  const submitMedicalScreening = useCallback(() => {
    setScreeningSubmitted(true);
    setAvailability(null);
    setSelectedSlot(null);
    setSelectedPartnerId("");
    setError("");
    if (screeningSelected.length) void persistScreening(screeningSelected);
    if (screeningSelected.length === 1 && screeningSelected[0] === "none") {
      if (contactIsComplete && additionalPatients.length === 0) {
        setContactSubmitted(true);
        setPatientDetailsExpanded(false);
        setNotice("Screening complete. Your Care profile is connected, so you can continue with the appointment location.");
      } else {
        setNotice("Screening complete. Add only the patient details still missing from your Care profile.");
      }
    } else {
      setNotice("Online booking is not available when any of the listed conditions apply. Please contact your healthcare professional before seeking mobile IV therapy.");
    }
  }, [additionalPatients.length, contactIsComplete, persistScreening, screeningSelected]);

  const submit = useCallback(async () => {
    if (!availability || !selectedSlot) return;
    if (!contactIsComplete || !additionalPatientsAreComplete || !address.addressLine1) {
      setError("Your patient details, all additional patient details and appointment address are required.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/public/booking/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicKey,
          date,
          startsAt: selectedSlot.startsAt,
          timezone: selectedSlot.timezone,
          requestedPartnerId: partnerId || selectedPartnerId || sourceContext.requestedPartnerId || undefined,
          customer: normalizedPerson(contact),
          attendees: additionalPatients.map((patient) => normalizedPerson(patient)),
          address,
          medicalScreening: {
            selected: screeningSelected,
            noneSelected: screeningIsClear,
            completedAt: new Date().toISOString(),
          },
          sourceUrl: document.referrer || window.location.origin,
          returnUrl: window.location.href,
          directoryAttribution: sourceContext.directoryAttribution || undefined,
        }),
      });
      const payload = await response.json();
      if (payload.status === "no_coverage") {
        setNotice(payload.message);
        return;
      }
      if (!response.ok || !payload.ok) throw new Error(payload.error || "The appointment could not be reserved.");
      if (payload.checkoutClientSecret && payload.stripePublishableKey) {
        setCheckoutState({
          clientSecret: payload.checkoutClientSecret,
          publishableKey: payload.stripePublishableKey,
          publicReference: payload.publicReference,
          sessionId: payload.checkoutSessionId || undefined,
        });
        setPaymentStatus("idle");
        setPaymentError("");
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      if (!payload.checkoutUrl) {
        await finalizeCheckout(payload.publicReference);
        return;
      }
      const destination = payload.checkoutUrl;
      // Older GHL embeds keep hosted Checkout as a compatibility fallback.
      if (window.top && window.top !== window) window.top.location.assign(destination);
      else window.location.assign(destination);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "The appointment could not be reserved.");
    } finally {
      setSubmitting(false);
    }
  }, [additionalPatients, additionalPatientsAreComplete, address, availability, contact, contactIsComplete, date, finalizeCheckout, partnerId, publicKey, screeningIsClear, screeningSelected, selectedPartnerId, selectedSlot, sourceContext.directoryAttribution, sourceContext.requestedPartnerId]);

  const submitDemand = useCallback(async () => {
    if (!contactIsComplete) {
      setError("Your first name, last name, email, phone and date of birth are required so we can notify you when coverage opens.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/public/booking/demand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicKey, customer: { fullName: fullName(contact), email: contact.email, phone: phoneForSubmission(contact) }, address, sourceUrl: document.referrer || window.location.origin }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "The coverage request could not be saved.");
      setNotice(partnerView ? "Thank you. Your request is now saved, and we will notify you when availability opens." : "Thank you. Your request is now in the My Drip Nurse coverage expansion list, and we will notify you when a qualified Partner becomes available.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "The coverage request could not be saved.");
    } finally {
      setSubmitting(false);
    }
  }, [address, contact, contactIsComplete, partnerView, publicKey]);

  if (confirmation) {
    return (
      <main className={`${styles.page} ${styles.paymentPage}`}>
        <section className={styles.paymentShell}>
          <div className={styles.confirmationHero}>
            <span className={styles.confirmationMark} aria-hidden="true">✓</span>
            <span className={styles.eyebrow}>APPOINTMENT CONFIRMED</span>
            <h1>Your mobile care is scheduled.</h1>
            <p>Everything is complete. Your appointment is now available in My Drip Nurse Care.</p>
          </div>
          <div className={styles.confirmationGrid}>
            <article className={styles.confirmationPrimary}>
              <span>SERVICE</span>
              <h2>{confirmation.service}</h2>
              <dl className={styles.confirmationDetails}>
                <div><dt>When</dt><dd>{formatConfirmationDate(confirmation.startsAt, confirmation.timezone)}</dd></div>
                <div><dt>Care location</dt><dd>{confirmationAddress(confirmation.location)}</dd></div>
                <div><dt>Patient</dt><dd>{confirmation.patient.name}</dd></div>
                {confirmation.additionalPatientsCount > 0 ? <div><dt>Additional patients</dt><dd>{confirmation.additionalPatientsCount}</dd></div> : null}
              </dl>
            </article>
            <aside className={styles.confirmationPayment}>
              <span>PAYMENT</span>
              <strong>{confirmation.depositAmount > 0 ? formatConfirmationMoney(confirmation.depositAmount, confirmation.currency) : "No deposit due"}</strong>
              <p>{confirmation.depositAmount > 0 ? "Secure deposit paid" : "Your eligible reward was applied"}</p>
              <small>Confirmation {confirmation.reference}</small>
            </aside>
          </div>
          <div className={styles.confirmationActions}>
            <a className={styles.primaryLink} href="/appointments">View appointment <span aria-hidden="true">→</span></a>
            <a className={styles.secondaryLink} href="/">Return home</a>
          </div>
        </section>
      </main>
    );
  }

  if (checkoutState || paymentReturn || paymentStatus === "processing" || paymentStatus === "error") {
    const retryConfirmation = () => {
      if (!paymentReturn && !checkoutState) return;
      if (paymentReturn) {
        void finalizeCheckout(paymentReturn.publicReference, paymentReturn.sessionId);
        return;
      }
      setPaymentStatus("idle");
      setPaymentError("");
      setCheckoutMountAttempt((current) => current + 1);
    };
    return (
      <main className={`${styles.page} ${styles.paymentPage}`}>
        <section className={styles.paymentShell}>
          <header className={styles.paymentHeader}>
            <span className={styles.eyebrow}>SECURE CHECKOUT</span>
            <h1>Complete your appointment.</h1>
            <p>Pay securely without leaving My Drip Nurse Care. Your selected service, time and patient details are already reserved.</p>
            <div className={styles.paymentTrust}><span aria-hidden="true">⌁</span> Encrypted payment · Powered by Stripe</div>
          </header>
          {checkoutState && paymentStatus !== "error" ? (
            <div className={styles.checkoutFrame}>
              <div id="mdn-embedded-checkout" />
            </div>
          ) : (
            <div className={styles.paymentStatusCard} role="status" aria-live="polite">
              {paymentStatus === "error" ? <>
                <span className={styles.paymentStatusIcon} aria-hidden="true">!</span>
                <h2>Let’s reconnect your payment.</h2>
                <p>{paymentError}</p>
                <button type="button" className={styles.primaryButton} onClick={retryConfirmation}>Try again</button>
              </> : <>
                <span className={styles.paymentSpinner} aria-hidden="true" />
                <h2>Confirming your appointment</h2>
                <p>Please keep this page open for a moment.</p>
              </>}
            </div>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <header className={styles.intro}>
          <span className={styles.eyebrow}>MY DRIP NURSE · SECURE BOOKING</span>
          <h1>Choose a time that works for you.</h1>
          <p>{partnerView ? "Live availability is shown for this service. Enter your location so we can confirm the appointment details." : "We show only qualified Partners who cover your appointment area and are available for this service."}</p>
        </header>

        <div className={styles.layout}>
          <section className={`${styles.card} ${styles.screeningCard}`} id="booking-medical-screening">
            <span className={styles.step}>1 · Medical screening</span>
            <h2 className={styles.screeningTitle}>Please select ALL of the following that apply to you.</h2>
            <p className={styles.screeningIntro}>This short screening helps us protect your safety. It is not a diagnosis or a substitute for medical advice.</p>
            {hasSavedScreening && !showFullScreening && !screeningSubmitted ? <div className={styles.savedScreeningReview}>
              <div>
                <strong>{screeningSelected.length === 1 && screeningSelected[0] === "none" ? "Your saved safety answers are ready to review." : `${screeningSelected.length} saved safety answer${screeningSelected.length === 1 ? "" : "s"} loaded.`}</strong>
                <p>Please confirm they are still accurate today. A previous confirmation is never carried into a new appointment automatically.</p>
              </div>
              <button className={styles.primaryButton} type="button" onClick={confirmSavedScreening}>I reviewed these answers today</button>
              <button className={styles.secondaryButton} type="button" onClick={() => setShowFullScreening(true)}>Update my answers</button>
            </div> : <>
            <div className={styles.screeningOptions} role="group" aria-label="Medical screening questions">
              {MEDICAL_SCREENING_OPTIONS.map((option) => {
                const checked = screeningSelected.includes(option.id);
                return (
                  <label className={styles.screeningOption} key={option.id}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setScreeningSelected((current) => option.id === "none"
                        ? (checked ? [] : ["none"])
                        : checked
                          ? current.filter((value) => value !== option.id)
                          : [...current.filter((value) => value !== "none"), option.id])}
                    />
                    <span>{option.label}</span>
                  </label>
                );
              })}
            </div>
            <div className={styles.screeningActions}>
              <button className={styles.primaryButton} type="button" onClick={submitMedicalScreening}>
          {screeningIsClear ? "Screening complete" : "Continue to appointment details"}
              </button>
            </div>
            {screeningSubmitted && !screeningIsClear ? <p className={styles.screeningWarning} role="alert">Online booking is unavailable with one or more selected conditions. Please contact a qualified healthcare professional.</p> : null}
            </>}
          </section>

          {screeningSubmitted && contactSubmitted && !patientDetailsExpanded ? (
          <section className={`${styles.card} ${styles.connectedProfileCard}`}>
            <div><span className={styles.step}>2 · Care profile connected</span><h2 className={styles.sectionTitle}>{fullName(contact)}</h2><p className={styles.sectionIntro}>We loaded your verified email and saved wellness details. You only need to review what is missing or changed.</p></div>
            <button className={styles.secondaryButton} type="button" onClick={() => { setContactSubmitted(false); setPatientDetailsExpanded(true); }}>Review patient details</button>
          </section>
          ) : null}

          {screeningSubmitted && (!contactSubmitted || patientDetailsExpanded) ? (
          <section className={`${styles.card} ${styles.patientCard}`}>
            <span className={styles.step}>2 · Patient details</span>
            <h2 className={styles.sectionTitle}>Review the primary patient.</h2>
            <p className={styles.sectionIntro}>Confirm the information for the main patient. Other patients can be added separately without reopening these details.</p>
            <div className={styles.grid}>
              <label>First name<input value={contact.firstName} onChange={(event) => { setContact((current) => ({ ...current, firstName: event.target.value })); setContactSubmitted(false); }} autoComplete="given-name" /></label>
              <label>Last name<input value={contact.lastName} onChange={(event) => { setContact((current) => ({ ...current, lastName: event.target.value })); setContactSubmitted(false); }} autoComplete="family-name" /></label>
              <label>Email<input type="email" value={contact.email} onChange={(event) => { setContact((current) => ({ ...current, email: event.target.value })); setContactSubmitted(false); }} autoComplete="email" /></label>
              <PhoneField
                value={contact.phone}
                countryCode={contact.phoneCountry}
                onCountryChange={(phoneCountry) => setContact((current) => ({ ...current, phoneCountry, phone: formatPhone(current.phone, phoneCountry) }))}
                onChange={(phone) => { setContact((current) => ({ ...current, phone })); setContactSubmitted(false); }}
                autoComplete="tel"
              />
              <label>Date of birth<input type="date" max={todayDate()} value={contact.dateOfBirth} onChange={(event) => { setContact((current) => ({ ...current, dateOfBirth: event.target.value })); setContactSubmitted(false); }} autoComplete="bday" /></label>
              <label>Sex / gender<select required value={contact.genderIdentity} onChange={(event) => { setContact((current) => ({ ...current, genderIdentity: normalizeGenderIdentity(event.target.value) })); setContactSubmitted(false); }}><option value="">Choose an option</option>{GENDER_IDENTITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><small>Select Male, Female, or Prefer not to say.</small></label>
              <label>Weight (lb)<input type="number" min="1" max="1000" step="0.1" required value={contact.weight} onChange={(event) => { setContact((current) => ({ ...current, weight: event.target.value })); setContactSubmitted(false); }} inputMode="decimal" placeholder="e.g. 165" /></label>
              <label>Height — feet<input type="number" min="1" max="8" step="1" required value={contact.heightFeet} onChange={(event) => { setContact((current) => ({ ...current, heightFeet: event.target.value })); setContactSubmitted(false); }} inputMode="numeric" placeholder="e.g. 5" /></label>
              <label>Height — inches<input type="number" min="0" max="11" step="1" required value={contact.heightInches} onChange={(event) => { setContact((current) => ({ ...current, heightInches: event.target.value })); setContactSubmitted(false); }} inputMode="numeric" placeholder="0–11" /></label>
            </div>
            <button className={styles.primaryButton} type="button" onClick={continueToLocation}>Continue to appointment location</button>
          </section>
          ) : null}

          {screeningSubmitted ? (
          <section className={`${styles.card} ${styles.additionalPatientsCard}`} id="booking-additional-patients">
            <div className={styles.additionalPatientsIntro}>
              <div>
                <span className={styles.optionalLabel}>Optional</span>
                <h2 className={styles.sectionTitle}>Add another patient.</h2>
                <p className={styles.sectionIntro}>Include anyone receiving care during this same visit. Each person gets a private invitation after confirmation.</p>
              </div>
              <button className={styles.addPatientButton} type="button" onClick={addAdditionalPatient} aria-controls="booking-additional-patient-list">+ Add patient</button>
            </div>
            <div id="booking-additional-patient-list">
              {additionalPatients.map((patient, index) => (
                <div className={styles.additionalPatient} key={patient.id}>
                  <div className={styles.additionalPatientHeader}><strong>Additional patient {index + 1}</strong><button className={styles.removeButton} type="button" onClick={() => setAdditionalPatients((current) => current.filter((item) => item.id !== patient.id))}>Remove</button></div>
                  <div className={styles.grid}>
                    <label>First name<input value={patient.firstName} onChange={(event) => setAdditionalPatients((current) => current.map((item) => item.id === patient.id ? { ...item, firstName: event.target.value } : item))} /></label>
                    <label>Last name<input value={patient.lastName} onChange={(event) => setAdditionalPatients((current) => current.map((item) => item.id === patient.id ? { ...item, lastName: event.target.value } : item))} /></label>
                    <label>Email<input type="email" value={patient.email} onChange={(event) => setAdditionalPatients((current) => current.map((item) => item.id === patient.id ? { ...item, email: event.target.value } : item))} /></label>
                    <PhoneField
                      value={patient.phone}
                      countryCode={patient.phoneCountry}
                      onCountryChange={(phoneCountry) => setAdditionalPatients((current) => current.map((item) => item.id === patient.id ? { ...item, phoneCountry, phone: formatPhone(item.phone, phoneCountry) } : item))}
                      onChange={(phone) => setAdditionalPatients((current) => current.map((item) => item.id === patient.id ? { ...item, phone } : item))}
                    />
                    <label>Date of birth<input type="date" max={todayDate()} value={patient.dateOfBirth} onChange={(event) => setAdditionalPatients((current) => current.map((item) => item.id === patient.id ? { ...item, dateOfBirth: event.target.value } : item))} /></label>
                    <label>Sex / gender<select required value={patient.genderIdentity} onChange={(event) => setAdditionalPatients((current) => current.map((item) => item.id === patient.id ? { ...item, genderIdentity: normalizeGenderIdentity(event.target.value) } : item))}><option value="">Choose an option</option>{GENDER_IDENTITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                    <label>Weight (lb)<input type="number" min="1" max="1000" step="0.1" required value={patient.weight} onChange={(event) => setAdditionalPatients((current) => current.map((item) => item.id === patient.id ? { ...item, weight: event.target.value } : item))} inputMode="decimal" placeholder="e.g. 165" /></label>
                    <label>Height — feet<input type="number" min="1" max="8" step="1" required value={patient.heightFeet} onChange={(event) => setAdditionalPatients((current) => current.map((item) => item.id === patient.id ? { ...item, heightFeet: event.target.value } : item))} inputMode="numeric" placeholder="e.g. 5" /></label>
                    <label>Height — inches<input type="number" min="0" max="11" step="1" required value={patient.heightInches} onChange={(event) => setAdditionalPatients((current) => current.map((item) => item.id === patient.id ? { ...item, heightInches: event.target.value } : item))} inputMode="numeric" placeholder="0–11" /></label>
                  </div>
                </div>
              ))}
            </div>
            {additionalPatients.length ? <button className={styles.primaryButton} type="button" onClick={continueToLocation}>Save patients and continue</button> : null}
          </section>
          ) : null}

          {screeningSubmitted && contactSubmitted ? (
          <section className={styles.card}>
            <span className={styles.step}>3 · Appointment location</span>
            {savedAddresses.length ? <div className={styles.savedAddressPicker}>
              <label>Choose a saved address
                <select value={selectedSavedAddressId} onChange={(event) => chooseSavedAddress(event.target.value)}>
                  {savedAddresses.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.addressLine1}, {item.city}</option>)}
                  <option value="">+ Use a new address</option>
                </select>
              </label>
              {selectedSavedAddressId ? <p>✓ Verified address selected. You can choose another saved location or add a new one for this visit.</p> : <p>Enter and verify the new service address below.</p>}
            </div> : null}
            <div className={styles.grid}>
              <label className={`${styles.wide} ${styles.addressSearchField}`}>Street address
                <span className={styles.addressInputWrap}><input value={address.addressLine1} onFocus={() => setAddressSuggestionsOpen(Boolean(addressSuggestions.length))} onBlur={() => window.setTimeout(() => setAddressSuggestionsOpen(false), 140)} onChange={(event) => { setAddress((current) => ({ ...current, addressLine1: event.target.value, longitude: undefined, latitude: undefined })); setAddressVerifiedLabel(""); setAddressFeatureId(""); setSelectedSavedAddressId(""); setAddressSaved(false); setAvailability(null); setSelectedSlot(null); }} autoComplete="off" role="combobox" aria-autocomplete="list" aria-haspopup="listbox" aria-expanded={addressSuggestionsOpen} aria-controls="booking-address-suggestions" placeholder="Start typing the appointment address" />{addressSearchBusy ? <i aria-label="Searching addresses" /> : addressVerifiedLabel ? <b title="Address selected">✓</b> : null}</span>
                {addressSuggestionsOpen ? <span className={styles.addressSuggestions} id="booking-address-suggestions" role="listbox">{addressSuggestions.map((suggestion) => <button type="button" role="option" aria-selected="false" key={suggestion.id} onMouseDown={(event) => event.preventDefault()} onClick={() => chooseAddressSuggestion(suggestion)}><span aria-hidden="true">⌖</span><span><strong>{suggestion.addressLine1}</strong><small>{suggestion.label.replace(`${suggestion.addressLine1}, `, "")}</small></span></button>)}</span> : null}
                <small className={styles.addressHelper}>{addressVerifiedLabel ? "Address selected and ready for final coverage verification." : "Choose a suggested address to prevent spelling, ZIP code and county errors."}</small>
              </label>
              <label className={styles.wide}>Apartment or suite <small>Optional</small><input value={address.addressLine2} onChange={(event) => setAddress((current) => ({ ...current, addressLine2: event.target.value }))} /></label>
              <label>City<input value={address.city} onChange={(event) => setAddress((current) => ({ ...current, city: event.target.value }))} autoComplete="address-level2" /></label>
              <label>State<input value={address.state} onChange={(event) => setAddress((current) => ({ ...current, state: event.target.value }))} autoComplete="address-level1" /></label>
              <label>ZIP code<input value={address.postalCode} onChange={(event) => setAddress((current) => ({ ...current, postalCode: event.target.value }))} autoComplete="postal-code" /></label>
              <label className={styles.wide}>Appointment date<input type="date" min={todayDate()} value={date} onChange={(event) => setDate(event.target.value)} /></label>
            </div>
            {initialProfile?.accountConnected && !selectedSavedAddressId && addressFeatureId ? <div className={styles.saveAddressChoice}>
              <label><input type="checkbox" checked={saveNewAddress} onChange={(event) => setSaveNewAddress(event.target.checked)} /> Save this verified address to my Care profile</label>
              {saveNewAddress ? <select aria-label="Address label" value={newAddressLabel} onChange={(event) => setNewAddressLabel(event.target.value)}><option>Home</option><option>Work</option><option>Family</option><option>Other</option></select> : null}
            </div> : null}
            <button className={styles.primaryButton} type="button" disabled={loading || geocoding} onClick={() => void loadAvailability()}>{geocoding ? "Verifying appointment area…" : loading ? "Checking availability…" : "See available times"}</button>
          </section>
          ) : null}

          {screeningIsClear && contactSubmitted ? (
          <section className={styles.card}>
            <span className={styles.step}>4 · Available times</span>
            {!availability ? <div className={styles.placeholder}>Enter the appointment location to see live availability.</div> : null}
            {availability ? (
              <div className={styles.serviceSummary}>
                <div><strong>{availability.calendar.serviceName}</strong><span>{availability.calendar.durationMinutes} minutes · book at least {Math.round(availability.calendar.minimumNoticeMinutes / 60)} hours ahead</span></div>
                <strong>{money(availability.calendar.price, availability.calendar.currency)}</strong>
              </div>
            ) : null}
            <div className={styles.slots}>
              {availability?.slots.map((slot) => (
                <button
                  className={selectedSlot?.startsAt === slot.startsAt ? styles.selectedSlot : styles.slot}
                  key={slot.startsAt}
                  type="button"
                  onClick={() => {
                    setSelectedSlot(slot);
                    setSelectedPartnerId(slot.partners.length === 1 ? slot.partners[0]?.id || "" : "");
                  }}
                >
                  <strong>{formatTime(slot.startsAt, slot.timezone)}</strong>
                  <span>{partnerView ? "Available" : `${slot.partners.length} ${slot.partners.length === 1 ? "Partner" : "Partners"} available`}</span>
                </button>
              ))}
            </div>

            {selectedSlot && !partnerView ? (
              <div className={styles.partnerPicker}>
                {selectedSlot.partners.length === 1 ? (
                  <div><span className={styles.step}>4 · Your available Partner</span><p>This is the Partner available for your selected appointment time.</p></div>
                ) : (
                  <>
                    <div><span className={styles.step}>4 · Choose your Partner</span><p>Select a Partner or leave “Best available” selected for balanced assignment.</p></div>
                    <label className={styles.partnerOption}>
                      <input type="radio" name="partner" checked={!selectedPartnerId} onChange={() => setSelectedPartnerId("")} />
                      <span className={styles.partnerAvatar}>✓</span>
                      <span><strong>Best available</strong><small>Prioritizes a Partner you&apos;ve seen before, then balances appointments fairly.</small></span>
                    </label>
                  </>
                )}
                {selectedSlot.partners.map((partner) => (
                  selectedSlot.partners.length === 1 ? (
                    <div className={`${styles.partnerOption} ${styles.singlePartnerOption}`} key={partner.id}>
                      <span className={styles.partnerAvatar}>{initials(partner.displayName)}</span>
                      <span><strong>{partner.displayName}</strong><small>{partner.businessName || "Verified My Drip Nurse Partner"}</small></span>
                    </div>
                  ) : (
                    <label className={styles.partnerOption} key={partner.id}>
                      <input type="radio" name="partner" checked={selectedPartnerId === partner.id} onChange={() => setSelectedPartnerId(partner.id)} />
                      <span className={styles.partnerAvatar}>{initials(partner.displayName)}</span>
                      <span><strong>{partner.displayName}</strong><small>{partner.businessName || "Verified My Drip Nurse Partner"}</small></span>
                    </label>
                  )
                ))}
              </div>
            ) : null}
          </section>
          ) : null}

          {screeningIsClear && selectedSlot ? (
            <section className={`${styles.card} ${styles.confirmCard}`}>
              <span className={styles.step}>5 · Confirm your details</span>
              <div className={styles.confirmSummary}><strong>{fullName(contact)}</strong><span>{contact.email} · {phoneForDisplay(contact)}</span><small>{additionalPatients.length ? `${additionalPatients.length} additional patient${additionalPatients.length === 1 ? "" : "s"} included` : "Primary patient only"}</small></div>
              <div className={styles.depositNote}>
                <strong>Appointment deposit</strong>
                <span>{availability?.calendar.depositType === "percentage"
                  ? `${money((availability.calendar.price * availability.calendar.depositValue) / 100, availability.calendar.currency)} · ${availability.calendar.depositValue}%`
                  : money(availability?.calendar.depositValue || 0, availability?.calendar.currency || "USD")}</span>
              </div>
              <button className={styles.primaryButton} type="button" disabled={submitting} onClick={() => void submit()}>{submitting ? "Reserving your appointment…" : "Continue to secure payment"}</button>
              <small className={styles.security}>Your appointment is confirmed only after Stripe verifies the deposit.</small>
            </section>
          ) : null}

          {availability && !availability.coverageAvailable ? (
            <section className={`${styles.card} ${styles.confirmCard}`}>
              <span className={styles.step}>Coverage request</span>
              <p className={styles.sectionIntro}>{partnerView ? "We have your contact details and will notify you when availability opens in this area." : "We have your contact details and will notify you when a qualified Partner becomes available in this area."}</p>
              <div className={styles.confirmSummary}><strong>{fullName(contact)}</strong><span>{contact.email} · {phoneForDisplay(contact)}</span></div>
              <button className={styles.primaryButton} type="button" disabled={submitting} onClick={() => void submitDemand()}>{submitting ? "Saving your request…" : "Notify me when coverage opens"}</button>
            </section>
          ) : null}
        </div>
        {error ? <div className={styles.error}>{error}</div> : null}
        {notice ? <div className={styles.notice}>{notice}</div> : null}
      </section>
    </main>
  );
}
