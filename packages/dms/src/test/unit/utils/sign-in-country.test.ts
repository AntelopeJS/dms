import { expect } from "chai";
import type { CountryResponse } from "mmdb-lib";
import { getAuthConfig, type SignInCountryConfig } from "../../../config";
import {
  countryDisplayName,
  type CountryLookup,
  lookupCountry,
  normalizeCountryCode,
  resetCountryLookup,
  resolveClientOrigin,
} from "../../../utils";

const PUBLIC_IP = "203.0.113.7";
const MISSING_DATABASE = "/nonexistent/sign-in-country.mmdb";

function lookupOf(records: Record<string, string>): CountryLookup {
  const isoCodes = new Map(Object.entries(records));
  return {
    get: (ip: string): CountryResponse | null => {
      const isoCode = isoCodes.get(ip);
      return isoCode
        ? {
            country: {
              geoname_id: 0,
              iso_code: isoCode,
              names: { en: isoCode },
            },
          }
        : null;
    },
  };
}

describe("[unit] utils/sign-in-country", () => {
  let previous: SignInCountryConfig | undefined;

  beforeEach(() => {
    previous = getAuthConfig().signInCountry;
    resetCountryLookup();
  });

  afterEach(() => {
    getAuthConfig().signInCountry = previous;
    resetCountryLookup();
  });

  it("keeps two-letter country codes only", () => {
    expect(normalizeCountryCode(" fr ")).to.equal("FR");
    expect(normalizeCountryCode(["BR", "US"])).to.equal("BR");
    expect(normalizeCountryCode("XX")).to.equal(undefined);
    expect(normalizeCountryCode("T1")).to.equal(undefined);
    expect(normalizeCountryCode("FRA")).to.equal(undefined);
    expect(normalizeCountryCode(undefined)).to.equal(undefined);
  });

  it("looks an address up in the database", () => {
    const lookup = lookupOf({ [PUBLIC_IP]: "GB" });
    expect(lookupCountry(PUBLIC_IP, lookup)).to.equal("GB");
    expect(lookupCountry("10.0.0.1", lookup)).to.equal(undefined);
    expect(lookupCountry("", lookup)).to.equal(undefined);
    expect(lookupCountry(PUBLIC_IP, null)).to.equal(undefined);
  });

  it("survives a malformed address", () => {
    const throwing: CountryLookup = {
      get: () => {
        throw new Error("bad address");
      },
    };
    expect(lookupCountry("not-an-ip", throwing)).to.equal(undefined);
  });

  it("reads CF-IPCountry while no header is configured", () => {
    getAuthConfig().signInCountry = undefined;
    expect(
      resolveClientOrigin(PUBLIC_IP, { "cf-ipcountry": "de" }),
    ).to.deep.equal({ ip: PUBLIC_IP, country: "DE" });
  });

  it("reads the configured header instead of CF-IPCountry", () => {
    getAuthConfig().signInCountry = { header: "X-Country" };
    expect(
      resolveClientOrigin(PUBLIC_IP, {
        "x-country": "it",
        "cf-ipcountry": "DE",
      }).country,
    ).to.equal("IT");
  });

  it("reads no header once it is turned off", () => {
    getAuthConfig().signInCountry = { header: false };
    expect(
      resolveClientOrigin(PUBLIC_IP, { "cf-ipcountry": "DE" }).country,
    ).to.equal(undefined);
  });

  it("reads no default header once a database is configured", () => {
    getAuthConfig().signInCountry = { database: MISSING_DATABASE };
    expect(
      resolveClientOrigin(PUBLIC_IP, { "cf-ipcountry": "FR" }).country,
    ).to.equal(undefined);
  });

  it("tells no country without a header or a database", () => {
    getAuthConfig().signInCountry = undefined;
    expect(resolveClientOrigin(PUBLIC_IP, {})).to.deep.equal({
      ip: PUBLIC_IP,
      country: undefined,
    });
  });

  it("tells no country when neither the header nor a database knows it", () => {
    getAuthConfig().signInCountry = { database: MISSING_DATABASE };
    expect(
      resolveClientOrigin(PUBLIC_IP, { "cf-ipcountry": "XX" }).country,
    ).to.equal(undefined);
  });

  it("names a country in the user's language", () => {
    expect(countryDisplayName("FR", "en")).to.equal("France");
    expect(countryDisplayName("DE", "fr")).to.equal("Allemagne");
    expect(countryDisplayName("DE", "not a language")).to.equal("Germany");
  });
});
