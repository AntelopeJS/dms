import {
  isSupportedCountry,
  parsePhoneNumberFromString,
} from "libphonenumber-js/min";

const PHONE_CHARACTERS = /^[+\d\s().\-/]+$/;

const INTERNATIONAL_CALL_PREFIX = /^00/;

/**
 * @internal The E.164 form ("+32494669443") of a phone number typed in any
 * common way ("0494 66 94 43", "+32 494...", "0032 494..."): a number without
 * a "+" or "00" prefix reads in `defaultCountry`. `undefined` when the text is
 * not a possible number of its country.
 */
export function toE164(
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
