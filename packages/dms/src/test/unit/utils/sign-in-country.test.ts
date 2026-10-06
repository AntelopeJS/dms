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
} from "../../../utils/sign-in-country";

const PUBLIC_IP = "203.0.113.7";
const MISSING_DATABASE = "/nonexistent/sign-in-country.mmdb";

function lookupOf(records: Record<string, string>): CountryLookup {
  return {
    get: (ip: string): CountryResponse | null =>
      records[ip] ? { country: { iso_code: records[ip] } as never } : null,
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

  it("reads the configured proxy header first", () => {
    getAuthConfig().signInCountry = {
      header: "CF-IPCountry",
      database: MISSING_DATABASE,
    };
    expect(
      resolveClientOrigin(PUBLIC_IP, { "cf-ipcountry": "de" }),
    ).to.deep.equal({ ip: PUBLIC_IP, country: "DE" });
  });

  it("ignores the header while no name is configured", () => {
    getAuthConfig().signInCountry = { database: false };
    expect(
      resolveClientOrigin(PUBLIC_IP, { "cf-ipcountry": "DE" }).country,
    ).to.equal(undefined);
  });

  it("tells no country when neither the header nor a database knows it", () => {
    getAuthConfig().signInCountry = {
      header: "CF-IPCountry",
      database: MISSING_DATABASE,
    };
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
