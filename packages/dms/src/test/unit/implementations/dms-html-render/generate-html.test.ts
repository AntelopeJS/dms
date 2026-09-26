import { expect } from "chai";
import { applyConfig } from "../../../../config";
import { GenerateHtml } from "../../../../implementations/dms-html-render";
import type { HtmlTemplateRef } from "@antelopejs/interface-dms/html-render";

const RENDER_ENDPOINT = "https://renderer.example/api/html/render";
const TEMPLATE = { name: "welcome" } as HtmlTemplateRef<{ name: string }>;

describe("[unit] implementations/dms-html-render — GenerateHtml", () => {
  const originalFetch = globalThis.fetch;
  const requests: Request[] = [];

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
      return new Response('{"html":"<p>Welcome</p>"}', {
        status: 200,
        headers: { "content-type": "application/json" },
      });
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
});
