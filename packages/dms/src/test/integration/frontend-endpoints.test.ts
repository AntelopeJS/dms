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
const BOOTSTRAP_REQUIRED = "error.frontend.bootstrap_required";

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

/**
 * The harness configures `frontend.bootstrapSecret`, so every test below runs
 * against an instance that gates its layer endpoints. The unauthenticated
 * `degrade` path — an instance configuring no credential — cannot be reached
 * from here because the config merge is additive and a test cannot unset the
 * secret; it is covered by the unit tests of `decideLayerAccess`.
 */
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

  describe("with a configured bootstrap secret", () => {
    it("refuses the manifest to a caller sending no credential", async () => {
      const response = await fetchManifest(client);
      expect(response.status).to.equal(HTTP_UNAUTHORIZED);
      expect(response.data).to.equal(BOOTSTRAP_REQUIRED);
    });

    it("refuses the manifest to a caller sending a bogus credential", async () => {
      const response = await fetchManifest(client, "not-the-secret");
      expect(response.status).to.equal(HTTP_UNAUTHORIZED);
      expect(response.data).to.equal(BOOTSTRAP_REQUIRED);
    });

    it("refuses the module archive to a caller sending no credential", async () => {
      const response = await client.get(
        "/dms/frontend/modules?renderer=vue&rendererVersion=3",
      );
      expect(response.status).to.equal(HTTP_UNAUTHORIZED);
      expect(response.data).to.equal(BOOTSTRAP_REQUIRED);
    });

    it("refuses the module archive to a caller sending a bogus credential", async () => {
      const response = await client.get(
        "/dms/frontend/modules?renderer=vue&rendererVersion=3",
        { headers: { [BOOTSTRAP_HEADER]: "not-the-secret" } },
      );
      expect(response.status).to.equal(HTTP_UNAUTHORIZED);
      expect(response.data).to.equal(BOOTSTRAP_REQUIRED);
    });

    // The regression this suite exists for: `warn` is the shipped default, and
    // it used to serve the manifest and the full frontend source to anyone.
    describe("and requireBootstrap left on its warn default", () => {
      before(() => applyConfig({ frontend: { requireBootstrap: "warn" } }));

      it("still refuses an unauthenticated caller", async () => {
        const response = await fetchManifest(client);
        expect(response.status).to.equal(HTTP_UNAUTHORIZED);
        expect(response.data).to.equal(BOOTSTRAP_REQUIRED);
      });

      it("still refuses an unauthenticated archive download", async () => {
        const response = await client.get(
          "/dms/frontend/modules?renderer=vue&rendererVersion=3",
        );
        expect(response.status).to.equal(HTTP_UNAUTHORIZED);
        expect(response.data).to.equal(BOOTSTRAP_REQUIRED);
      });
    });

    describe("and requireBootstrap set to enforce", () => {
      before(() => applyConfig({ frontend: { requireBootstrap: "enforce" } }));
      after(() => applyConfig({ frontend: { requireBootstrap: "warn" } }));

      it("refuses an unauthenticated caller", async () => {
        const response = await fetchManifest(client);
        expect(response.status).to.equal(HTTP_UNAUTHORIZED);
        expect(response.data).to.equal(BOOTSTRAP_REQUIRED);
      });

      it("still serves an authenticated caller", async () => {
        const response = await fetchManifest(client, bootstrapSecret());
        expect(response.status).to.equal(HTTP_OK);
      });
    });
  });

  describe("served to an authenticated caller", () => {
    it("serves renderer metadata", async () => {
      const response = await fetchManifest(client, bootstrapSecret());
      expect(response.status).to.equal(HTTP_OK);
      expect(response.data.version).to.equal(1);
      expect(response.data.archive).to.equal(
        "/dms/frontend/modules?renderer=vue&rendererVersion=3",
      );
      expect(response.data.modules[0].renderer.name).to.equal("vue");
    });

    it("serves private options", async () => {
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
        { headers: { [BOOTSTRAP_HEADER]: bootstrapSecret() } },
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
      const response = await client.get("/dms/frontend?renderer=vue", {
        headers: { [BOOTSTRAP_HEADER]: bootstrapSecret() },
      });
      expect(response.status).to.equal(HTTP_BAD_REQUEST);
      expect(response.data).to.equal(
        "error.frontend_renderer_selection_required",
      );
    });

    it("rejects unsupported renderer selections without falling back", async () => {
      const response = await client.get(
        "/dms/frontend?renderer=svelte&rendererVersion=5",
        { headers: { [BOOTSTRAP_HEADER]: bootstrapSecret() } },
      );
      expect(response.status).to.equal(HTTP_NOT_FOUND);
      expect(response.data).to.equal("error.frontend_renderer_not_found");
    });
  });
});
