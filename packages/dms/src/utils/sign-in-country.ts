import { ownValue } from "./own-value";
import { readFileSync } from "node:fs";
import { Logging } from "@antelopejs/interface-core/logging";
import { type CountryResponse, Reader } from "mmdb-lib";
import { getAuthConfig } from "../config";

const FALLBACK_LANGUAGE = "en";
const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;

const NON_COUNTRY_CODES: ReadonlySet<string> = new Set(["XX", "T1"]);

/** The header read for the country while `auth.signInCountry.header` is unset. */
const DEFAULT_COUNTRY_HEADER = "CF-IPCountry";

/** Finds the country record of an address. */
export interface CountryLookup {
  get(ip: string): CountryResponse | null;
}

/** Where a request came from, as the sign-in checks read it. */
export interface ClientOrigin {
  /** The client address (`resolveClientIp`); empty when unknown. */
  ip: string;
  /** Upper-case ISO 3166-1 alpha-2 code, when one could be told. */
  country?: string;
}

let cachedLookup: CountryLookup | null | undefined;

function openDatabase(file: string): CountryLookup | null {
  try {
    return new Reader<CountryResponse>(readFileSync(file));
  } catch (error) {
    Logging.Warn(
      `[DMS] Cannot read the sign-in country database \`auth.signInCountry.database\` names ("${file}"): without the header, sign-ins are told apart by device only (${String(error)})`,
    );
    return null;
  }
}

/** The configured country database, opened once; `null` when there is none. */
function countryLookup(): CountryLookup | null {
  if (cachedLookup !== undefined) return cachedLookup;
  const file = getAuthConfig().signInCountry?.database;
  cachedLookup = file ? openDatabase(file) : null;
  return cachedLookup;
}

/** Forgets the opened database, so the next lookup reads the configuration again. */
export function resetCountryLookup(): void {
  cachedLookup = undefined;
}

/** An upper-case country code, or `undefined` for anything that is not one. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Country normalization is a parser for proxy headers and lookup values; malformed inputs must still yield undefined.
export function normalizeCountryCode(value: unknown): string | undefined {
  const candidate: unknown = Array.isArray(value) ? value[0] : value;
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Only string country codes are normalized; numeric and object inputs are ignored.
  if (typeof candidate !== "string") return undefined;
  const code = candidate.trim().toUpperCase();
  if (!COUNTRY_CODE_PATTERN.test(code) || NON_COUNTRY_CODES.has(code)) {
    return undefined;
  }
  return code;
}

/**
 * The country an address belongs to, from the configured database.
 *
 * @param ip Client address; private and malformed ones have no country
 * @param lookup Database to read, the configured one by default
 */
export function lookupCountry(
  ip: string,
  lookup: CountryLookup | null = countryLookup(),
): string | undefined {
  if (!ip || !lookup) return undefined;
  try {
    return normalizeCountryCode(lookup.get(ip)?.country?.iso_code);
  } catch {
    return undefined;
  }
}

/** Header values by lower-case name, as Node exposes them. */
export type RequestHeaders = Record<string, string | string[] | undefined>;

/**
 * The origin of a request: its client address and the country it came from —
 * the configured proxy header first, then the database.
 */
export function resolveClientOrigin(
  ip: string,
  headers: RequestHeaders,
): ClientOrigin {
  const header =
    getAuthConfig().signInCountry?.header ?? DEFAULT_COUNTRY_HEADER;
  const country =
    (header
      ? normalizeCountryCode(ownValue(headers, header.toLowerCase()))
      : undefined) ?? lookupCountry(ip);
  return { ip, country };
}

function displayLocales(language: string | undefined): string[] {
  try {
    return [...Intl.getCanonicalLocales(language ?? []), FALLBACK_LANGUAGE];
  } catch {
    return [FALLBACK_LANGUAGE];
  }
}

/**
 * A country's name in a language (`FR` → "France", "Frankreich"), in English
 * when the language is not one the runtime knows.
 *
 * @param code Upper-case ISO 3166-1 alpha-2 code
 * @param language The reader's language tag
 */
export function countryDisplayName(code: string, language?: string): string {
  const names = new Intl.DisplayNames(displayLocales(language), {
    type: "region",
  });
  return names.of(code) ?? code;
}
