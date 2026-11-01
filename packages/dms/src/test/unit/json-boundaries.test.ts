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
const ACCESS_TOKEN = "provider-access-token";

const originalFetch = globalThis.fetch;

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

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
});
