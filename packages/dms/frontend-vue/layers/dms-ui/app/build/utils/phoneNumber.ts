import {
  AsYouType,
  type CountryCode,
  getCountries,
  getCountryCallingCode,
  isSupportedCountry,
  parsePhoneNumberFromString,
} from "libphonenumber-js/min";

const PHONE_CHARACTERS = /^[+\d\s().\-/]+$/;

const INTERNATIONAL_PREFIX = /^(\+|00)/;

const E164 = /^\+[1-9]\d{1,14}$/;

/** A country the phone input offers: its ISO code and calling code. */
export interface PhoneCountry {
  code: CountryCode;
  /** Without its "+": "32". */
  callingCode: string;
}

/** What the user typed into a phone input, read in its selected country. */
export interface TypedPhone {
  /** The text formatted as it is typed ("+32 494 66", "0494 66 94"). */
  text: string;
  /** The country a "+" or "00" prefix names, else the selected one. */
  country?: CountryCode;
  /** The value to store: E.164 when it is a possible number, else the text. */
  value: string;
  /** Whether `value` is a possible number, in E.164. */
  isNumber: boolean;
}

/** The supported country an ISO 3166-1 alpha-2 code ("be", "BE") names. */
export function phoneCountry(
  code: string | null | undefined,
): CountryCode | undefined {
  const upper = code?.trim().toUpperCase();
  return upper && isSupportedCountry(upper) ? upper : undefined;
}

export function phoneCountries(): PhoneCountry[] {
  return getCountries().map((code) => ({
    code,
    callingCode: getCountryCallingCode(code),
  }));
}

function isInternational(text: string): boolean {
  return INTERNATIONAL_PREFIX.test(text.trim());
}

function withPlus(text: string): string {
  return text.trim().replace(INTERNATIONAL_PREFIX, "+");
}

function parse(text: string, country: CountryCode | undefined) {
  if (!PHONE_CHARACTERS.test(text.trim())) return undefined;
  return parsePhoneNumberFromString(
    withPlus(text),
    country ? { defaultCountry: country } : undefined,
  );
}

/**
 * The E.164 form ("+32494669443") of a phone number typed in any common way:
 * a number without a "+" or "00" prefix reads in `country`. `undefined` when
 * the text is not a possible number of its country. The server's `PhoneType`
 * applies the same rule.
 */
export function toE164(
  text: string,
  country?: CountryCode,
): string | undefined {
  const parsed = parse(text, country);
  return parsed?.isPossible() ? parsed.number : undefined;
}

/**
 * How a stored phone number reads: an E.164 value in international format
 * ("+32 494 66 94 43"), anything else as stored.
 */
export function formatPhone(value: string): string {
  if (!E164.test(value)) return value;
  return parsePhoneNumberFromString(value)?.formatInternational() ?? value;
}

/** The country a stored E.164 value belongs to. */
export function storedPhoneCountry(value: string): CountryCode | undefined {
  if (!E164.test(value)) return undefined;
  return parsePhoneNumberFromString(value)?.country;
}

export function readTypedPhone(
  text: string,
  country: CountryCode | undefined,
): TypedPhone {
  const value = toE164(text, country);
  const isNumber = value !== undefined;
  if (!PHONE_CHARACTERS.test(text.trim())) {
    return { text, country, value: text, isNumber };
  }
  if (!isInternational(text)) {
    const formatter = new AsYouType(country);
    return {
      text: formatter.input(text),
      country,
      value: value ?? text,
      isNumber,
    };
  }
  const formatter = new AsYouType();
  const formatted = formatter.input(withPlus(text));
  const callingCode = formatter.getCallingCode();
  const keepsCountry =
    country !== undefined &&
    callingCode !== undefined &&
    getCountryCallingCode(country) === callingCode;
  return {
    text: formatted,
    country: formatter.getCountry() ?? (keepsCountry ? country : undefined),
    value: value ?? text,
    isNumber,
  };
}

/**
 * The number typed, moved to another country: an international number keeps
 * its national part under the new calling code. A national number, or text
 * that is no number, stays as typed, to be read in the new country.
 */
export function moveToCountry(
  text: string,
  from: CountryCode | undefined,
  to: CountryCode,
): string {
  if (!isInternational(text)) return text;
  const parsed = parse(text, from);
  if (!parsed) return text;
  return new AsYouType().input(
    `+${getCountryCallingCode(to)}${parsed.nationalNumber}`,
  );
}
