import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { applyConfig } from "../../config";
import { AddFrontendModule } from "../../implementations/dms/page";
import { createClient } from "../helpers/http";

const BOOTSTRAP_HEADER = "x-dms-bootstrap";
const HTTP_OK = 200;
const HTTP_UNAUTHORIZED = 401;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const ZIP_MAGIC = "PK";
const ARCHIVE_TIMEOUT_MS = 30_000;

interface FrontendRenderer {
  name: string;
  version: string;
}

interface FrontendManifestModule {
  name: string;
  renderer: FrontendRenderer;
  path?: string;
  privateOptions?: Record<string, unknown>;
}

interface FrontendManifest {
  version: number;
  archive: string;
  modules: FrontendManifestModule[];
}

function bootstrapSecret(): string {
  return process.env.TEST_BOOTSTRAP_SECRET ?? "test-bootstrap-secret";
}

function fetchManifest(client: AxiosInstance, secret?: string) {
  return client.get<FrontendManifest>("/dms/frontend", {
    headers: secret ? { [BOOTSTRAP_HEADER]: secret } : {},
  });
}

describe("[integration] dms frontend endpoints", () => {
  let client: AxiosInstance;

  before(() => {
    client = createClient();
    AddFrontendModule({
      name: "@antelopejs/dms-frontend-vue",
      sourcePath: `${process.cwd()}/frontend-vue`,
      renderer: { name: "test-renderer", version: "1.1.0" },
      priority: 0,
    });
  });

  it("serves renderer metadata without private fields anonymously", async () => {
    const response = await fetchManifest(client);
    expect(response.status).to.equal(HTTP_OK);
    expect(response.data.version).to.equal(1);
    expect(response.data.archive).to.equal(
      "/dms/frontend/modules?renderer=vue&rendererVersion=3",
    );
    expect(response.data.modules[0].renderer.name).to.equal("vue");
    expect(response.data.modules[0]).to.not.have.property("privateOptions");
    expect(response.data.modules[0]).to.not.have.property("path");
  });

  it("serves private options to an authenticated caller", async () => {
    const response = await fetchManifest(client, bootstrapSecret());
    expect(
      response.data.modules.some((module) => module.privateOptions),
    ).to.equal(true);
  });

  it("serves the frontend archive", async function () {
    this.timeout(ARCHIVE_TIMEOUT_MS);
    const response = await client.get("/dms/frontend/modules", {
      headers: { [BOOTSTRAP_HEADER]: bootstrapSecret() },
      responseType: "arraybuffer",
    });
    expect(Buffer.from(response.data).subarray(0, 2).toString()).to.equal(
      ZIP_MAGIC,
    );
  });

  it("isolates implementations sharing a logical module name", async () => {
    const response = await client.get<FrontendManifest>(
      "/dms/frontend?renderer=test-renderer&rendererVersion=1",
    );
    expect(response.status).to.equal(HTTP_OK);
    expect(
      response.data.modules.map((module) => module.renderer.name),
    ).to.deep.equal(["test-renderer"]);
    expect(response.data.modules[0].name).to.equal(
      "@antelopejs/dms-frontend-vue",
    );
  });

  it("rejects incomplete renderer selections", async () => {
    const response = await client.get("/dms/frontend?renderer=vue");
    expect(response.status).to.equal(HTTP_BAD_REQUEST);
    expect(response.data).to.equal(
      "error.frontend_renderer_selection_required",
    );
  });

  it("rejects unsupported renderer selections without falling back", async () => {
    const response = await client.get(
      "/dms/frontend?renderer=svelte&rendererVersion=5",
    );
    expect(response.status).to.equal(HTTP_NOT_FOUND);
    expect(response.data).to.equal("error.frontend_renderer_not_found");
  });

  describe("with enforcement on", () => {
    before(() => applyConfig({ frontend: { requireBootstrap: "enforce" } }));
    after(() => applyConfig({ frontend: { requireBootstrap: "warn" } }));

    it("refuses anonymous frontend requests", async () => {
      const response = await fetchManifest(client);
      expect(response.status).to.equal(HTTP_UNAUTHORIZED);
      expect(response.data).to.equal("error.frontend.bootstrap_required");
    });

    it("still serves authenticated frontend requests", async () => {
      const response = await fetchManifest(client, bootstrapSecret());
      expect(response.status).to.equal(HTTP_OK);
    });
  });
});
