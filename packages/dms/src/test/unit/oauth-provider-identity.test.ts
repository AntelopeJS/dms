import { HTTPResult } from "@antelopejs/interface-api";
import { expect } from "chai";
import { OAUTH_PROVIDERS } from "../../routes/auth/oauth/providers";

const HTTP_BAD_GATEWAY = 502;
const ACCESS_TOKEN = "provider-access-token";

type FetchResponses = Record<string, unknown>;

const originalFetch = globalThis.fetch;

function stubFetch(responses: FetchResponses): void {
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input);
    const match = Object.entries(responses).find(([path]) =>
      url.includes(path),
    );
    if (!match) {
      return { ok: false, json: async () => ({}) };
    }
    return { ok: true, json: async () => match[1] };
  }) as typeof fetch;
}

async function expectRefusal(
  run: () => Promise<unknown>,
  expectedMessage: string,
): Promise<void> {
  try {
    await run();
  } catch (error: unknown) {
    expect(error).to.be.instanceOf(HTTPResult);
    expect((error as HTTPResult).getStatus()).to.equal(HTTP_BAD_GATEWAY);
    expect((error as HTTPResult).getBody()).to.equal(expectedMessage);
    return;
  }
  expect.fail(`expected a refusal with "${expectedMessage}"`);
}

describe("[unit] oauth provider identity parsing", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("github", () => {
    const fetchIdentity = () =>
      OAUTH_PROVIDERS.github.fetchIdentity(ACCESS_TOKEN);

    it("builds the identity from the primary verified e-mail", async () => {
      stubFetch({
        "/user/emails": [
          { email: "old@acme.dev", primary: false, verified: true },
          { email: "alex@acme.dev", primary: true, verified: true },
        ],
        "/user": { id: 42, login: "alex", name: "Alex" },
      });

      expect(await fetchIdentity()).to.deep.equal({
        providerAccountId: "42",
        email: "alex@acme.dev",
        isEmailVerified: true,
        name: "Alex",
      });
    });

    it("never verifies an e-mail the provider did not flag", async () => {
      stubFetch({
        "/user/emails": [{ email: "alex@acme.dev", primary: true }],
        "/user": { id: 42, login: "alex", name: null },
      });

      const identity = await fetchIdentity();
      expect(identity.isEmailVerified).to.equal(false);
      expect(identity.name).to.equal("alex");
    });

    it("refuses a response without an account id", async () => {
      stubFetch({
        "/user/emails": [{ email: "alex@acme.dev", primary: true }],
        "/user": { login: "alex" },
      });
      await expectRefusal(fetchIdentity, "error.oauth.identity_malformed");
    });

    it("refuses an empty-string account id", async () => {
      stubFetch({
        "/user/emails": [{ email: "alex@acme.dev", primary: true }],
        "/user": { id: "", login: "alex" },
      });
      await expectRefusal(fetchIdentity, "error.oauth.identity_malformed");
    });

    it("refuses a malformed e-mail list", async () => {
      stubFetch({
        "/user/emails": { message: "rate limited" },
        "/user": { id: 42, login: "alex" },
      });
      await expectRefusal(fetchIdentity, "error.oauth.email_unavailable");
    });

    it("refuses an e-mail entry without an address", async () => {
      stubFetch({
        "/user/emails": [{ primary: true, verified: true }],
        "/user": { id: 42, login: "alex" },
      });
      await expectRefusal(fetchIdentity, "error.oauth.email_unavailable");
    });
  });

  describe("google", () => {
    const fetchIdentity = () =>
      OAUTH_PROVIDERS.google.fetchIdentity(ACCESS_TOKEN);

    it("builds the identity from the userinfo claims", async () => {
      stubFetch({
        userinfo: {
          sub: "google-sub-1",
          email: "alex@acme.dev",
          email_verified: true,
          name: "Alex",
        },
      });

      expect(await fetchIdentity()).to.deep.equal({
        providerAccountId: "google-sub-1",
        email: "alex@acme.dev",
        isEmailVerified: true,
        name: "Alex",
      });
    });

    it("refuses a response without a subject", async () => {
      stubFetch({
        userinfo: { email: "alex@acme.dev", email_verified: true },
      });
      await expectRefusal(fetchIdentity, "error.oauth.identity_malformed");
    });

    it("never verifies an e-mail without the explicit claim", async () => {
      stubFetch({
        userinfo: { sub: "google-sub-1", email: "alex@acme.dev" },
      });
      expect((await fetchIdentity()).isEmailVerified).to.equal(false);
    });

    it("refuses a response without an e-mail", async () => {
      stubFetch({ userinfo: { sub: "google-sub-1" } });
      await expectRefusal(fetchIdentity, "error.oauth.email_unavailable");
    });
  });
});
