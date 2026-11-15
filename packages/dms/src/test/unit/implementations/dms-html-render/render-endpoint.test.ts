import { createServer, type Server } from "node:http";
import { expect } from "chai";
import { z } from "zod";
import { getHtmlRenderConfig, setDevClientBaseUrl } from "../../../../config";
import { GenerateHtml } from "../../../../implementations/dms-html-render";

const TEMPLATE = { name: "welcome" };
const RenderRequestSchema = z.object({ templateName: z.string() });
const TcpAddressSchema = z.object({ port: z.number() });

describe("[unit] implementations/dms-html-render — render endpoint", () => {
  const received: { path: string; templateName: string }[] = [];
  let dashboard: Server;
  let dashboardOrigin = "";
  let configuredEndpoint: string | undefined;

  before(async () => {
    dashboard = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        const { templateName } = RenderRequestSchema.parse(
          JSON.parse(Buffer.concat(chunks).toString()),
        );
        received.push({ path: request.url ?? "", templateName });
        response.setHeader("content-type", "application/json");
        response.end('{"html":"<p>From the dashboard</p>"}');
      });
    });
    await new Promise<void>((resolve) =>
      dashboard.listen(0, "127.0.0.1", resolve),
    );
    const { port } = TcpAddressSchema.parse(dashboard.address());
    expect(port).to.not.equal(3001);
    dashboardOrigin = `http://127.0.0.1:${port}`;
    configuredEndpoint = getHtmlRenderConfig().renderEndpoint;
  });

  after(async () => {
    Reflect.deleteProperty(getHtmlRenderConfig(), "renderEndpoint");
    if (configuredEndpoint) {
      getHtmlRenderConfig().renderEndpoint = configuredEndpoint;
    }
    setDevClientBaseUrl(undefined);
    await new Promise((resolve) => dashboard.close(resolve));
  });

  beforeEach(() => {
    received.length = 0;
    Reflect.deleteProperty(getHtmlRenderConfig(), "renderEndpoint");
  });

  it("posts to the dashboard's origin when no endpoint is configured", async () => {
    setDevClientBaseUrl(dashboardOrigin);

    const html = await GenerateHtml(TEMPLATE, {});

    expect(html).to.equal("<p>From the dashboard</p>");
    expect(received).to.deep.equal([
      { path: "/api/html/render", templateName: "welcome" },
    ]);
  });

  it("prefers a configured renderEndpoint to the dashboard's origin", async () => {
    setDevClientBaseUrl("http://127.0.0.1:9");
    getHtmlRenderConfig().renderEndpoint = `${dashboardOrigin}/custom/render`;

    await GenerateHtml(TEMPLATE, {});

    expect(received).to.deep.equal([
      { path: "/custom/render", templateName: "welcome" },
    ]);
  });
});
