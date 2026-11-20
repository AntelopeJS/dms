import {
  isSupportedCountry,
  parsePhoneNumberFromString,
} from "libphonenumber-js/min";

const PHONE_CHARACTERS = /^[+\d\s().\-/]+$/;

const INTERNATIONAL_CALL_PREFIX = /^00/;

export function ToE164(
  text: string,
  defaultCountry?: string,
): string | undefined {
  const trimmed = text.trim();
  if (!PHONE_CHARACTERS.test(trimmed)) return undefined;
  const country = defaultCountry?.trim().toUpperCase();
  const parsed = parsePhoneNumberFromString(
    trimmed.replace(INTERNATIONAL_CALL_PREFIX, "+"),
    country && isSupportedCountry(country)
      ? { defaultCountry: country }
      : undefined,
  );
  return parsed?.isPossible() ? parsed.number : undefined;
}
