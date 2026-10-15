import { expect } from "chai";
import { applyConfig } from "../../../../config";
import { GenerateHtml } from "../../../../implementations/dms-html-render";
import type { HtmlTemplateRef } from "@antelopejs/interface-dms/html-render";

const RENDER_ENDPOINT = "https://renderer.example/api/html/render";
const TEMPLATE = { name: "welcome" } as HtmlTemplateRef<{ name: string }>;

describe("[unit] implementations/dms-html-render — GenerateHtml", () => {
  const originalFetch = globalThis.fetch;
  const requests: Request[] = [];
  let answer = () =>
    new Response('{"html":"<p>Welcome</p>"}', {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  before(() => {
    applyConfig({
      htmlRender: {
        renderEndpoint: RENDER_ENDPOINT,
        serviceSecret: "test-service-secret",
        serviceTokenLifetime: 60_000,
      },
    });
    globalThis.fetch = async (input, init) => {
      requests.push(new Request(input, init));
      return answer();
    };
  });

  after(() => {
    globalThis.fetch = originalFetch;
  });

  beforeEach(() => {
    requests.length = 0;
  });

  it("sends an optional language as x-content-language", async () => {
    await GenerateHtml(TEMPLATE, { name: "Ada" }, "fr-FR");

    expect(requests).to.have.lengthOf(1);
    expect(requests[0].headers.get("x-content-language")).to.equal("fr-FR");
  });

  it("omits x-content-language when language is absent", async () => {
    await GenerateHtml(TEMPLATE, { name: "Ada" });

    expect(requests).to.have.lengthOf(1);
    expect(requests[0].headers.has("x-content-language")).to.equal(false);
  });

  it("reports the renderer's reason for a refused render", async () => {
    const previous = answer;
    answer = () =>
      new Response('{"message":"Invalid service token"}', {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    try {
      let failure: unknown;
      await GenerateHtml(TEMPLATE, { name: "Ada" }).catch((error) => {
        failure = error;
      });
      expect((failure as Error).message).to.equal(
        "Failed to render HTML template: Invalid service token",
      );
    } finally {
      answer = previous;
    }
  });
});
