import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "chai";
import { createIgnoreFilter } from "../../../../implementations/dms/page";

type ArchiveFilter = ReturnType<typeof createIgnoreFilter>;

function isPacked(filter: ArchiveFilter, name: string): boolean {
  return filter({ name }) !== false;
}

describe("[unit] layer archive filter", () => {
  let layerDir: string;

  beforeEach(() => {
    layerDir = mkdtempSync(join(tmpdir(), "dms-layer-"));
  });

  afterEach(() => {
    rmSync(layerDir, { recursive: true, force: true });
  });

  const excluded = [
    "server.pem",
    "a/b/c/tls.key",
    "certs/client.p12",
    "credentials.json",
    "credentials-prod.json",
    "secrets/db.yaml",
    "app.secret",
    ".git/config",
    ".git/objects/ab/cdef",
    ".npmrc",
    ".netrc",
    ".env.local",
    "id_rsa",
    "node_modules/left-pad/index.js",
  ];

  for (const name of excluded) {
    it(`excludes ${name}`, () => {
      expect(isPacked(createIgnoreFilter(layerDir), name)).to.equal(false);
    });
  }

  const included = [
    "app/composables/useKey.ts",
    "app/components/Keyboard.vue",
    "app/components/Credentials.vue",
    "server/routes/auth/oauth/start.get.ts",
    "package.json",
  ];

  for (const name of included) {
    it(`packs ${name}`, () => {
      expect(isPacked(createIgnoreFilter(layerDir), name)).to.equal(true);
    });
  }

  it("honours the layer's own gitignore, anchoring included", () => {
    writeFileSync(join(layerDir, ".gitignore"), "/dist\n");
    const filter = createIgnoreFilter(layerDir);
    expect(isPacked(filter, "dist/x.js")).to.equal(false);
    expect(isPacked(filter, "sub/dist-notes.md")).to.equal(true);
  });

  it("excludes secrets a layer's gitignore does not mention", () => {
    writeFileSync(join(layerDir, ".gitignore"), "/dist\n");
    expect(isPacked(createIgnoreFilter(layerDir), "server.pem")).to.equal(
      false,
    );
  });
});
