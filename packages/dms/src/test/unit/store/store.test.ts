import { expect } from "chai";
import { isStoreEditable } from "../../../config";
import { loadStoreCatalog, readCatalogDocument } from "../../../store/catalog";
import { isCompatible } from "../../../store/compatibility";
import { packageDeclarationSource } from "../../../store/declarations";
import { isLive } from "../../../store/runtime";
import type { RuntimeModule } from "../../../store/types";

function runtimeModule(status: string): RuntimeModule {
  return {
    id: "@antelopejs/dms-lang",
    packageName: "@antelopejs/dms-lang",
    status,
    localPath: "/modules/dms-lang",
  };
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

describe("[unit] store/runtime", () => {
  it("counts a module as running only while it holds an instance", () => {
    expect(isLive(runtimeModule("active"))).to.equal(true);
    expect(isLive(runtimeModule("constructed"))).to.equal(true);
    expect(isLive(runtimeModule("loaded"))).to.equal(false);
    expect(isLive(undefined)).to.equal(false);
  });
});

describe("[unit] store/declarations", () => {
  it("writes a package source at the given range", () => {
    expect(
      packageDeclarationSource("@antelopejs/dms-lang", "^0.1.1"),
    ).to.deep.equal({
      type: "package",
      package: "@antelopejs/dms-lang",
      version: "^0.1.1",
    });
  });
});

describe("[unit] store/editable", () => {
  it("follows the runtime mode by default", () => {
    expect(isStoreEditable(true)).to.equal(true);
    expect(isStoreEditable(false)).to.equal(false);
  });
});
