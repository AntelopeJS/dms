import { expect } from "chai";
import { getAuthConfig, getHtmlRenderConfig } from "../../config";
import {
  assertProductionSecrets,
  resolveClientBaseUrl,
} from "../../startup-config";

const STRONG_SECRET = "a-strong-secret";
const PUBLIC_SECRET = "dev";
const DASHBOARD_ORIGIN = "https://dashboard.example.com";
const DEVELOPMENT_ORIGIN = "http://localhost:3001";

const NOT_AN_ORIGIN = [
  "https://dashboard.example.com/app",
  "https://dashboard.example.com/?tenant=1",
  "https://dashboard.example.com/#home",
  "https://user:pass@dashboard.example.com",
  "ftp://dashboard.example.com",
  "dashboard.example.com",
  "not a url",
];

describe("[unit] production secrets", () => {
  let jwtSecret: string;
  let serviceSecret: string;

  beforeEach(() => {
    jwtSecret = getAuthConfig().jwtSecret;
    serviceSecret = getHtmlRenderConfig().serviceSecret;
    getAuthConfig().jwtSecret = STRONG_SECRET;
    getHtmlRenderConfig().serviceSecret = STRONG_SECRET;
  });

  afterEach(() => {
    getAuthConfig().jwtSecret = jwtSecret;
    getHtmlRenderConfig().serviceSecret = serviceSecret;
  });

  it("lets a production start through with both secrets set", () => {
    expect(() => assertProductionSecrets()).not.to.throw();
  });

  for (const value of ["", "  ", PUBLIC_SECRET, ` ${PUBLIC_SECRET} `]) {
    it(`refuses auth.jwtSecret set to ${JSON.stringify(value)}`, () => {
      getAuthConfig().jwtSecret = value;
      expect(() => assertProductionSecrets()).to.throw(
        /auth\.jwtSecret is required in production \(set it from JWT_SECRET/,
      );
    });

    it(`refuses htmlRender.serviceSecret set to ${JSON.stringify(value)}`, () => {
      getHtmlRenderConfig().serviceSecret = value;
      expect(() => assertProductionSecrets()).to.throw(
        /htmlRender\.serviceSecret is required in production \(set it from DMS_HTML_RENDER_SECRET/,
      );
    });
  }
});

describe("[unit] client base url", () => {
  it("keeps the origin of a configured URL, in production and in development", () => {
    for (const dev of [false, true]) {
      expect(resolveClientBaseUrl(`${DASHBOARD_ORIGIN}/`, dev)).to.equal(
        DASHBOARD_ORIGIN,
      );
    }
  });

  it("keeps an explicit port", () => {
    expect(resolveClientBaseUrl("http://127.0.0.1:4000", false)).to.equal(
      "http://127.0.0.1:4000",
    );
  });

  it("falls back on the local development server in development", () => {
    expect(resolveClientBaseUrl(undefined, true)).to.equal(DEVELOPMENT_ORIGIN);
    expect(resolveClientBaseUrl("  ", true)).to.equal(DEVELOPMENT_ORIGIN);
  });

  it("is required in production", () => {
    for (const raw of [undefined, "", "  "]) {
      expect(() => resolveClientBaseUrl(raw, false)).to.throw(
        /clientBaseUrl is required in production \(set it from DMS_CLIENT_BASE_URL/,
      );
    }
  });

  it("refuses anything but an http(s) origin, in development too", () => {
    for (const raw of NOT_AN_ORIGIN) {
      for (const dev of [false, true]) {
        expect(() => resolveClientBaseUrl(raw, dev), raw).to.throw(
          /clientBaseUrl must be the dashboard's http\(s\) origin/,
        );
      }
    }
  });
});
