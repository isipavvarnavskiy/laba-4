import React, { useRef } from 'react';
import { formatRussianPhoneInput, RUSSIAN_PHONE_HTML_PATTERN } from '../../shared/validation.js';

export default function RussianPhoneInput({ id, value, onChange, ...props }) {
  const inputRef = useRef(null);

  function handleChange(event) {
    const input = event.currentTarget;
    const digitsBeforeCaret = input.value.slice(0, input.selectionStart ?? input.value.length).replace(/\D/g, '').length;
    const hasCountryPrefix = /^\+7/u.test(input.value.trim()) || input.value.replace(/\D/g, '').length > 10;
    const formatted = formatRussianPhoneInput(input.value);
    const formattedDigitsBeforeCaret = digitsBeforeCaret + (hasCountryPrefix ? 0 : 1);
    onChange(formatted);
    window.requestAnimationFrame(() => {
      const element = inputRef.current;
      if (!element) return;
      let caret = 0;
      let seenDigits = 0;
      while (caret < formatted.length && seenDigits < formattedDigitsBeforeCaret) {
        if (/\d/.test(formatted[caret])) seenDigits += 1;
        caret += 1;
      }
      if (formattedDigitsBeforeCaret === 0 && formatted.startsWith('+7')) caret = formatted.length;
      element.setSelectionRange(caret, caret);
    });
  }

  return (
    <input
      {...props}
      ref={inputRef}
      id={id}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      value={value}
      onChange={handleChange}
      maxLength={16}
      pattern={RUSSIAN_PHONE_HTML_PATTERN}
      placeholder="+7(900)123-45-67"
      title="Введите российский номер в формате +7(900)123-45-67"
    />
  );
}
