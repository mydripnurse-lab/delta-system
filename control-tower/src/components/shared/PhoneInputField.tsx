"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import {
  formatPhone,
  normalizePhone,
  PHONE_COUNTRIES,
  phoneCountry,
  phoneCountryOption,
  type PhoneCountryCode,
} from "@/lib/phoneInput";

import styles from "./PhoneInputField.module.css";

type PhoneInputFieldProps = {
  label?: ReactNode;
  name?: string;
  value?: string;
  defaultValue?: string;
  countryCode?: PhoneCountryCode;
  defaultCountryCode?: PhoneCountryCode;
  onValueChange?: (normalizedValue: string, formattedValue: string, countryCode: PhoneCountryCode) => void;
  onCountryChange?: (countryCode: PhoneCountryCode) => void;
  required?: boolean;
  disabled?: boolean;
  autoComplete?: string;
  className?: string;
};

export default function PhoneInputField({
  label = "Phone",
  name,
  value,
  defaultValue = "",
  countryCode,
  defaultCountryCode,
  onValueChange,
  onCountryChange,
  required,
  disabled,
  autoComplete = "tel",
  className = "",
}: PhoneInputFieldProps) {
  const initialValue = value ?? defaultValue;
  const [localCountry, setLocalCountry] = useState<PhoneCountryCode>(() => defaultCountryCode || phoneCountry(initialValue));
  const [localValue, setLocalValue] = useState(() => formatPhone(initialValue));
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedCountry = countryCode || localCountry;
  const displayedValue = value === undefined ? localValue : formatPhone(value);
  const normalizedValue = useMemo(() => normalizePhone(displayedValue, selectedCountry), [displayedValue, selectedCountry]);
  const selected = phoneCountryOption(selectedCountry);

  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form || value !== undefined) return;
    const reset = () => {
      setLocalCountry(defaultCountryCode || phoneCountry(defaultValue));
      setLocalValue(formatPhone(defaultValue));
    };
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, [defaultCountryCode, defaultValue, value]);

  function updateValue(nextRawValue: string, nextCountry = selectedCountry) {
    const formattedValue = formatPhone(nextRawValue);
    if (value === undefined) setLocalValue(formattedValue);
    onValueChange?.(normalizePhone(formattedValue, nextCountry), formattedValue, nextCountry);
  }

  function updateCountry(nextCountry: PhoneCountryCode) {
    if (countryCode === undefined) setLocalCountry(nextCountry);
    onCountryChange?.(nextCountry);
    onValueChange?.(normalizePhone(displayedValue, nextCountry), displayedValue, nextCountry);
  }

  return (
    <label className={`${styles.field} ${className}`.trim()}>
      {label ? <span className={styles.label}>{label}</span> : null}
      <span className={styles.control}>
        <select
          className={styles.country}
          value={selectedCountry}
          onChange={(event) => updateCountry(event.target.value as PhoneCountryCode)}
          disabled={disabled}
          aria-label={`Phone country or region. Current selection: ${selected.name} ${selected.dialCode}`}
          title={`${selected.name} (${selected.dialCode})`}
        >
          {PHONE_COUNTRIES.map((country) => (
            <option key={country.code} value={country.code} aria-label={`${country.name} ${country.dialCode}`}>
              {country.flag} ({country.dialCode})
            </option>
          ))}
        </select>
        <input
          ref={inputRef}
          className={styles.number}
          type="tel"
          value={displayedValue}
          onChange={(event) => updateValue(event.target.value)}
          placeholder={selected.placeholder}
          inputMode="tel"
          autoComplete={autoComplete}
          required={required}
          disabled={disabled}
          maxLength={14}
          pattern={"\\(\\d{3}\\) \\d{3}-\\d{4}"}
          title="Enter a complete 10-digit phone number"
          aria-label={`${selected.name} phone number`}
        />
        {name ? <input type="hidden" name={name} value={normalizedValue} /> : null}
      </span>
    </label>
  );
}
