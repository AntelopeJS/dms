import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect } from "chai";
import { isStoreEditable } from "../../../config";
import { loadStoreCatalog, readCatalogDocument } from "../../../store/catalog";
import { isCompatible } from "../../../store/compatibility";
import {
  DEFAULT_STATE_FILE,
  parseDesiredState,
  readDesiredState,
  writeDesiredState,
} from "../../../store/desired-state";
import { isDeclaredByConfig, storeModuleId } from "../../../store/runtime";
import type { RuntimeModule } from "../../../store/types";

const LANG = {
  package: "@antelopejs/dms-lang",
  version: "0.1.1",
  enabled: true,
  config: {},
};

function runtimeModule(
  id: string,
  packageName: string | undefined,
): RuntimeModule {
  return { id, packageName, status: "active", localPath: `/modules/${id}` };
}

describe("[unit] store/catalog", () => {
  it("reads the bundled catalog, one entry per official module", async () => {
    const catalog = await loadStoreCatalog();
    const ids = catalog.map((entry) => entry.id);
    expect(ids).to.include.members(["lang", "media", "database"]);
    expect(new Set(ids).size).to.equal(ids.length);
  });

  it("drops an entry missing a field rather than half-reading it", () => {
    const entries = readCatalogDocument({
      version: 1,
      modules: [
        {
          id: "lang",
          package: "@antelopejs/dms-lang",
          icon: "i",
          category: "content",
        },
        { id: "nameless", icon: "i", category: "content" },
      ],
    });
    expect(entries.map((entry) => entry.id)).to.deep.equal(["lang"]);
  });

  it("refuses a catalog of another version", () => {
    expect(() => readCatalogDocument({ version: 2, modules: [] })).to.throw(
      /Unsupported module catalog version/,
    );
  });
});

describe("[unit] store/compatibility", () => {
  it("follows the interface range a release depends on", () => {
    const release = { version: "1.0.0", interfaceRange: ">=0.6.0 <1.0.0" };
    expect(isCompatible(release, "0.6.1")).to.equal(true);
    expect(isCompatible(release, "0.5.9")).to.equal(false);
  });

  it("does not hold back a release that names no range", () => {
    expect(isCompatible({ version: "1.0.0" }, "0.6.1")).to.equal(true);
  });
});

describe("[unit] store/desired-state", () => {
  let projectPath: string;

  beforeEach(async () => {
    projectPath = await mkdtemp(path.join(tmpdir(), "dms-store-"));
  });

  afterEach(async () => {
    await rm(projectPath, { recursive: true, force: true });
  });

  it("starts empty when the file does not exist", async () => {
    expect(await readDesiredState(projectPath)).to.deep.equal({ modules: {} });
  });

  it("writes a readable file that reads back the same", async () => {
    await writeDesiredState(projectPath, { modules: { lang: LANG } });
    const content = await readFile(
      path.join(projectPath, DEFAULT_STATE_FILE),
      "utf-8",
    );
    expect(content).to.contain('\n  "modules": {\n');
    expect(await readDesiredState(projectPath)).to.deep.equal({
      modules: { lang: LANG },
    });
  });

  it("refuses an entry missing a field instead of dropping the module", () => {
    expect(() =>
      parseDesiredState(
        JSON.stringify({ modules: { lang: { package: "x", enabled: true } } }),
      ),
    ).to.throw(/module "lang" needs a package, a version and enabled/);
  });
});

describe("[unit] store/runtime", () => {
  it("names store modules apart from the config's", () => {
    expect(storeModuleId("lang")).to.equal("store-lang");
  });

  it("sees a package the config already declares", () => {
    const runtime = new Map([
      ["lang", runtimeModule("lang", "@antelopejs/dms-lang")],
      ["store-media", runtimeModule("store-media", "@antelopejs/dms-media")],
    ]);
    expect(isDeclaredByConfig(runtime, "@antelopejs/dms-lang")).to.equal(true);
    expect(isDeclaredByConfig(runtime, "@antelopejs/dms-media")).to.equal(
      false,
    );
  });
});

describe("[unit] store/editable", () => {
  it("follows the runtime mode by default", () => {
    expect(isStoreEditable(true)).to.equal(true);
    expect(isStoreEditable(false)).to.equal(false);
  });
});
