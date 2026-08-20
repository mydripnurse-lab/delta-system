"use client";

import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";

import {
  formatPhone,
  hasRecognizedDialCode,
  nationalPhoneDigits,
  normalizePhone,
  PHONE_COUNTRIES,
  phoneCountry,
  phoneCountryOption,
  type PhoneCountryCode,
} from "@/lib/phoneInput";

import styles from "./PhoneInputField.module.css";

type PhoneInputFieldProps = {
  label?: ReactNode;
  hint?: ReactNode;
  name?: string;
  value?: string;
  defaultValue?: string;
  countryCode?: PhoneCountryCode;
  defaultCountryCode?: PhoneCountryCode;
  onValueChange?: (normalizedValue: string, formattedValue: string, countryCode: PhoneCountryCode) => void;
  onCountryChange?: (countryCode: PhoneCountryCode) => void;
  action?: ReactNode;
  required?: boolean;
  disabled?: boolean;
  autoComplete?: string;
  className?: string;
};

const FEATURED_COUNTRIES: PhoneCountryCode[] = ["US", "PR", "CA", "MX"];

export default function PhoneInputField({
  label = "Phone",
  hint,
  name,
  value,
  defaultValue = "",
  countryCode,
  defaultCountryCode,
  onValueChange,
  onCountryChange,
  action,
  required,
  disabled,
  autoComplete = "tel",
  className = "",
}: PhoneInputFieldProps) {
  const initialValue = value ?? defaultValue;
  const initialCountry = defaultCountryCode || phoneCountry(initialValue);
  const [localCountry, setLocalCountry] = useState<PhoneCountryCode>(initialCountry);
  const [localValue, setLocalValue] = useState(() => formatPhone(initialValue, initialCountry));
  const [countryOpen, setCountryOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const lastExternalValueRef = useRef(value);
  const listId = useId();
  const selectedCountry = countryCode || localCountry;
  const normalizedValue = useMemo(() => normalizePhone(localValue, selectedCountry), [localValue, selectedCountry]);
  const selected = phoneCountryOption(selectedCountry);
  const filteredCountries = useMemo(() => {
    const query = countrySearch.trim().toLocaleLowerCase();
    const matches = query
      ? PHONE_COUNTRIES.filter((country) => `${country.name} ${country.code} ${country.dialCode}`.toLocaleLowerCase().includes(query))
      : PHONE_COUNTRIES;
    return [...matches].sort((a, b) => {
      const aFeatured = FEATURED_COUNTRIES.indexOf(a.code);
      const bFeatured = FEATURED_COUNTRIES.indexOf(b.code);
      if (aFeatured !== -1 || bFeatured !== -1) {
        if (aFeatured === -1) return 1;
        if (bFeatured === -1) return -1;
        return aFeatured - bFeatured;
      }
      return a.name.localeCompare(b.name);
    });
  }, [countrySearch]);

  useEffect(() => {
    if (value === undefined || value === lastExternalValueRef.current) return;
    lastExternalValueRef.current = value;
    const detectedCountry = phoneCountry(value, selectedCountry);
    if (countryCode === undefined && detectedCountry !== localCountry) setLocalCountry(detectedCountry);
    setLocalValue(formatPhone(value, detectedCountry));
  }, [countryCode, localCountry, selectedCountry, value]);

  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form || value !== undefined) return;
    const reset = () => {
      const resetCountry = defaultCountryCode || phoneCountry(defaultValue);
      setLocalCountry(resetCountry);
      setLocalValue(formatPhone(defaultValue, resetCountry));
      setCountryOpen(false);
      setCountrySearch("");
    };
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, [defaultCountryCode, defaultValue, value]);

  useEffect(() => {
    if (!countryOpen) return;
    const focusFrame = window.requestAnimationFrame(() => searchRef.current?.focus());
    const close = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setCountryOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCountryOpen(false);
        setCountrySearch("");
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [countryOpen]);

  function publishValue(formattedValue: string, nextCountry: PhoneCountryCode) {
    const normalized = normalizePhone(formattedValue, nextCountry);
    setLocalValue(formattedValue);
    lastExternalValueRef.current = normalized;
    onValueChange?.(normalized, formattedValue, nextCountry);
  }

  function updateValue(nextRawValue: string) {
    const isInternationalDraft = nextRawValue.trim().startsWith("+");
    if (isInternationalDraft && !hasRecognizedDialCode(nextRawValue)) {
      const draft = nextRawValue.replace(/(?!^)\+|[^\d+]/g, "").slice(0, 5);
      setLocalValue(draft);
      lastExternalValueRef.current = "";
      onValueChange?.("", draft, selectedCountry);
      return;
    }

    const detectedCountry = phoneCountry(nextRawValue, selectedCountry);
    if (detectedCountry !== selectedCountry) {
      if (countryCode === undefined) setLocalCountry(detectedCountry);
      onCountryChange?.(detectedCountry);
    }

    if (isInternationalDraft && nationalPhoneDigits(nextRawValue, detectedCountry).length === 0) {
      const draft = nextRawValue.replace(/(?!^)\+|[^\d+]/g, "").slice(0, 5);
      setLocalValue(draft);
      lastExternalValueRef.current = "";
      onValueChange?.("", draft, detectedCountry);
      return;
    }
    publishValue(formatPhone(nextRawValue, detectedCountry), detectedCountry);
  }

  function updateCountry(nextCountry: PhoneCountryCode) {
    if (countryCode === undefined) setLocalCountry(nextCountry);
    onCountryChange?.(nextCountry);
    publishValue(formatPhone(localValue, nextCountry), nextCountry);
    setCountryOpen(false);
    setCountrySearch("");
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  return (
    <div className={`${styles.field} ${className}`.trim()}>
      {label ? <span className={styles.label}>{label}</span> : null}
      <div className={`${styles.control} ${action ? styles.controlWithAction : ""}`}>
        <div className={styles.countryPicker} ref={pickerRef}>
          <button
            className={styles.countryButton}
            type="button"
            disabled={disabled}
            aria-haspopup="listbox"
            aria-expanded={countryOpen}
            aria-controls={listId}
            aria-label={`Choose phone country or region. Current selection: ${selected.name} ${selected.dialCode}`}
            onClick={() => { setCountryOpen((current) => !current); setCountrySearch(""); }}
          >
            <span className={styles.selectedFlag} aria-hidden="true">{selected.flag}</span>
            <span className={styles.selectedDial}>{selected.dialCode}</span>
            <svg aria-hidden="true" viewBox="0 0 12 8"><path d="m1 1 5 5 5-5" /></svg>
          </button>

          {countryOpen ? <div className={styles.countryMenu}>
            <div className={styles.countrySearch}>
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m21 21-4.35-4.35m2.35-5.65a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" /></svg>
              <input
                ref={searchRef}
                className={styles.searchInput}
                value={countrySearch}
                onChange={(event) => setCountrySearch(event.target.value)}
                placeholder="Search country or code"
                autoComplete="off"
                aria-label="Search phone countries"
              />
            </div>
            <div className={styles.countryList} id={listId} role="listbox" aria-label="Phone countries and calling codes">
              {filteredCountries.map((country) => <button
                key={country.code}
                type="button"
                role="option"
                aria-selected={country.code === selectedCountry}
                className={country.code === selectedCountry ? styles.countryOptionSelected : ""}
                onClick={() => updateCountry(country.code)}
              >
                <span className={styles.optionFlag} aria-hidden="true">{country.flag}</span>
                <span className={styles.optionName}>{country.name}<small>{country.code}</small></span>
                <span className={styles.optionDial}>{country.dialCode}</span>
                {country.code === selectedCountry ? <span className={styles.optionCheck} aria-hidden="true">✓</span> : null}
              </button>)}
              {!filteredCountries.length ? <p className={styles.noCountries}>No countries found.</p> : null}
            </div>
          </div> : null}
        </div>

        <input
          ref={inputRef}
          className={styles.number}
          type="tel"
          value={localValue}
          onChange={(event) => updateValue(event.target.value)}
          placeholder={selected.placeholder}
          inputMode="tel"
          autoComplete={autoComplete}
          required={required}
          disabled={disabled}
          maxLength={24}
          title={`Enter a complete phone number for ${selected.name}`}
          aria-label={`${selected.name} phone number`}
        />
        {action ? <div className={styles.action}>{action}</div> : null}
        {name ? <input type="hidden" name={name} value={normalizedValue} /> : null}
      </div>
      {hint ? <span className={styles.hint}>{hint}</span> : null}
    </div>
  );
}
