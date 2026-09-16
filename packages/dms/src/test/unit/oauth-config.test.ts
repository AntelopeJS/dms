import { HTTPResult } from "@antelopejs/interface-api";
import { expect } from "chai";
import { getAuthConfig, type OAuthConfig } from "../../index";
import { buildOAuthAuthorizeUrl } from "../../routes/auth/oauth/authorize-url";
import {
  getEnabledOAuthProvider,
  listEnabledOAuthProviders,
  resolveOAuthPolicy,
} from "../../routes/auth/oauth/config";

const HTTP_NOT_FOUND = 404;
const CREDENTIALS = { clientId: "client-id", clientSecret: "client-secret" };

describe("[unit] oauth config", () => {
  let previousOAuth: OAuthConfig | undefined;

  beforeEach(() => {
    previousOAuth = getAuthConfig().oauth;
  });

  afterEach(() => {
    getAuthConfig().oauth = previousOAuth;
  });

  function configure(oauth: OAuthConfig): void {
    getAuthConfig().oauth = oauth;
  }

  describe("enabled providers", () => {
    it("offers nothing when the instance configured nothing", () => {
      configure({});
      expect(listEnabledOAuthProviders()).to.deep.equal([]);
    });

    it("only offers providers holding both credentials", () => {
      configure({
        providers: {
          github: CREDENTIALS,
          google: { clientId: "only-an-id", clientSecret: "" },
        },
      });
      expect(listEnabledOAuthProviders()).to.deep.equal([
        { id: "github", label: "GitHub", icon: "i-ph-github-logo" },
      ]);
    });

    it("ignores an unknown provider id", () => {
      configure({ providers: { gitlab: CREDENTIALS } });
      expect(listEnabledOAuthProviders()).to.deep.equal([]);
    });

    it("refuses to start a flow on a provider without credentials", () => {
      configure({ providers: {} });
      try {
        getEnabledOAuthProvider("github");
      } catch (error: unknown) {
        expect(error).to.be.instanceOf(HTTPResult);
        expect((error as HTTPResult).getStatus()).to.equal(HTTP_NOT_FOUND);
        return;
      }
      expect.fail("expected a disabled provider to be refused");
    });
  });

  describe("policy defaults", () => {
    it("keeps provider sign-up off and e-mail linking on", () => {
      configure({});
      expect(resolveOAuthPolicy()).to.deep.equal({
        allowAccountCreation: false,
        linkByVerifiedEmail: true,
      });
    });

    it("honours an explicit opt-in", () => {
      configure({ allowAccountCreation: true, linkByVerifiedEmail: false });
      expect(resolveOAuthPolicy()).to.deep.equal({
        allowAccountCreation: true,
        linkByVerifiedEmail: false,
      });
    });
  });

  describe("authorize url", () => {
    it("carries the client id, callback, scopes and state", () => {
      configure({
        providers: { github: CREDENTIALS },
        callbackBaseUrl: "https://console.example.dev",
      });

      const { authorizeUrl, state } = buildOAuthAuthorizeUrl("github");
      const url = new URL(authorizeUrl);

      expect(url.origin + url.pathname).to.equal(
        "https://github.com/login/oauth/authorize",
      );
      expect(url.searchParams.get("client_id")).to.equal("client-id");
      expect(url.searchParams.get("redirect_uri")).to.equal(
        "https://console.example.dev/auth/oauth/github/callback",
      );
      expect(url.searchParams.get("scope")).to.equal("read:user user:email");
      expect(url.searchParams.get("response_type")).to.equal("code");
      expect(url.searchParams.get("state")).to.equal(state);
    });

    it("never leaks the client secret into the browser-facing url", () => {
      configure({
        providers: { github: CREDENTIALS },
        callbackBaseUrl: "https://console.example.dev",
      });
      expect(buildOAuthAuthorizeUrl("github").authorizeUrl).to.not.contain(
        "client-secret",
      );
    });

    it("uses the scopes the instance overrode", () => {
      configure({
        providers: {
          github: { ...CREDENTIALS, scopes: ["read:user"] },
        },
        callbackBaseUrl: "https://console.example.dev",
      });

      const url = new URL(buildOAuthAuthorizeUrl("github").authorizeUrl);
      expect(url.searchParams.get("scope")).to.equal("read:user");
    });

    it("trims a trailing slash off the configured callback origin", () => {
      configure({
        providers: { google: CREDENTIALS },
        callbackBaseUrl: "https://console.example.dev/",
      });

      const url = new URL(buildOAuthAuthorizeUrl("google").authorizeUrl);
      expect(url.searchParams.get("redirect_uri")).to.equal(
        "https://console.example.dev/auth/oauth/google/callback",
      );
    });
  });
});
