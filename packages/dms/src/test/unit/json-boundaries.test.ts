import { HTTPResult } from "@antelopejs/interface-api";
import { assert, expect } from "chai";
import { applyConfig } from "../../config";
import { GenerateHtml } from "../../implementations/dms-html-render";
import {
  exchangeCodeForAccessToken,
  OAUTH_PROVIDERS,
  type ProviderIdentity,
} from "../../routes/auth/oauth";

const HTTP_BAD_GATEWAY = 502;
const HTTP_INTERNAL_ERROR = 500;
const ACCESS_TOKEN = "provider-access-token";

const originalFetch = globalThis.fetch;

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

function stubFailedFetch(status: number, body: Json): void {
  globalThis.fetch = async () => Response.json(body, { status });
}

function stubFetch(answers: Record<string, Json>): void {
  globalThis.fetch = async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    const match = Object.entries(answers).find(([path]) => url.includes(path));
    return match ? Response.json(match[1]) : Response.json({}, { status: 500 });
  };
}

async function refusalOf(
  run: () => Promise<ProviderIdentity | string>,
): Promise<HTTPResult> {
  try {
    await run();
  } catch (error: unknown) {
    assert.instanceOf(error, HTTPResult);
    return error;
  }
  throw new Error("expected a refusal");
}

async function renderFailure(): Promise<string> {
  try {
    await GenerateHtml({ name: "welcome" }, {});
  } catch (error: unknown) {
    assert.instanceOf(error, Error);
    return error.message;
  }
  throw new Error("expected a failure");
}

describe("[unit] documents read at a boundary", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("render service", () => {
    beforeEach(() => {
      applyConfig({
        htmlRender: {
          renderEndpoint: "https://renderer.example/api/html/render",
          serviceSecret: "test-service-secret",
          serviceTokenLifetime: 60_000,
        },
      });
    });

    it("refuses an answer that carries no html", async () => {
      stubFetch({ "/render": { status: "ok" } });
      let message = "";
      try {
        await GenerateHtml({ name: "welcome" }, {});
      } catch (error: unknown) {
        assert.instanceOf(error, Error);
        message = error.message;
      }
      expect(message).to.equal(
        "Failed to render HTML template: the render service answered no html",
      );
    });

    it("names the status when the failure body is not an object", async () => {
      stubFailedFetch(HTTP_INTERNAL_ERROR, null);
      expect(await renderFailure()).to.equal(
        "Failed to render HTML template: HTTP 500",
      );
    });

    it("names the status when the failure message is not a string", async () => {
      stubFailedFetch(HTTP_INTERNAL_ERROR, { message: 5 });
      expect(await renderFailure()).to.equal(
        "Failed to render HTML template: HTTP 500",
      );
    });

    it("reports the message of a failure body that carries one", async () => {
      stubFailedFetch(HTTP_INTERNAL_ERROR, { message: "template missing" });
      expect(await renderFailure()).to.equal(
        "Failed to render HTML template: template missing",
      );
    });

    it("returns the html it answers", async () => {
      stubFetch({ "/render": { html: "<p>Hi</p>" } });
      expect(await GenerateHtml({ name: "welcome" }, {})).to.equal("<p>Hi</p>");
    });
  });

  describe("oauth token exchange", () => {
    const exchange = () =>
      exchangeCodeForAccessToken(
        {
          id: "github",
          provider: OAUTH_PROVIDERS.github,
          credentials: { clientId: "id", clientSecret: "secret" },
        },
        "code",
      );

    it("returns a string access token", async () => {
      stubFetch({ "/access_token": { access_token: ACCESS_TOKEN } });
      expect(await exchange()).to.equal(ACCESS_TOKEN);
    });

    it("refuses an access token that is not a string", async () => {
      stubFetch({ "/access_token": { access_token: 12345 } });
      const refusal = await refusalOf(exchange);
      expect(refusal.getStatus()).to.equal(HTTP_BAD_GATEWAY);
    });

    it("refuses an answer that is not an object", async () => {
      stubFetch({ "/access_token": null });
      const refusal = await refusalOf(exchange);
      expect(refusal.getStatus()).to.equal(HTTP_BAD_GATEWAY);
    });
  });

  describe("github identity", () => {
    const fetchIdentity = () =>
      OAUTH_PROVIDERS.github.fetchIdentity(ACCESS_TOKEN);

    it("refuses an e-mail list holding a non-object", async () => {
      stubFetch({
        "/user/emails": [{ email: "a@acme.dev", primary: true }, null],
        "/user": { id: 1, login: "a" },
      });
      const refusal = await refusalOf(fetchIdentity);
      expect(refusal.getStatus()).to.equal(HTTP_BAD_GATEWAY);
      expect(refusal.getBody()).to.equal("error.oauth.email_unavailable");
    });

    it("refuses a profile that is not an object", async () => {
      stubFetch({ "/user/emails": [], "/user": null });
      const refusal = await refusalOf(fetchIdentity);
      expect(refusal.getStatus()).to.equal(HTTP_BAD_GATEWAY);
      expect(refusal.getBody()).to.equal("error.oauth.provider_unreachable");
    });
  });

  describe("google identity", () => {
    const fetchIdentity = () =>
      OAUTH_PROVIDERS.google.fetchIdentity(ACCESS_TOKEN);

    it("refuses a profile that is not an object", async () => {
      stubFetch({ "/userinfo": null });
      const refusal = await refusalOf(fetchIdentity);
      expect(refusal.getStatus()).to.equal(HTTP_BAD_GATEWAY);
      expect(refusal.getBody()).to.equal("error.oauth.provider_unreachable");
    });

    it("reads the identity of a well-formed profile", async () => {
      stubFetch({
        "/userinfo": {
          sub: "g-1",
          email: "a@acme.dev",
          email_verified: true,
          name: "A",
        },
      });
      expect(await fetchIdentity()).to.deep.equal({
        providerAccountId: "g-1",
        email: "a@acme.dev",
        isEmailVerified: true,
        name: "A",
      });
    });
  });
});
