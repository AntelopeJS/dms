import { expect } from "chai";
import {
  type ManifestModuleEntry,
  type ModuleManifestShape,
  stripPrivateManifestFields,
} from "../../../../implementations/dms/manifest";

interface LayerEntry extends ManifestModuleEntry {
  name: string;
  archiveName: string;
  priority: number;
  configKey?: string;
}

function buildManifest(): ModuleManifestShape<LayerEntry> {
  return {
    pack: "/dms/frontend/modules",
    modules: [
      {
        name: "@scope/dms-frontend",
        archiveName: "@scope-dms-frontend",
        priority: 0,
        configKey: "dms",
        path: "/srv/app/node_modules/@scope/dms/frontend",
        options: { baseURL: "https://api.example.com" },
        privateOptions: { oauth: { relaySecret: "s3cret" } },
      },
      {
        name: "@scope/dms-lang-layer",
        archiveName: "@scope-dms-lang-layer",
        priority: 1,
        path: "/srv/app/node_modules/@scope/dms-lang/frontend",
      },
    ],
  };
}

describe("[unit] manifest field policy", () => {
  it("keeps everything when the caller is entitled to both fields", () => {
    const manifest = buildManifest();
    const shaped = stripPrivateManifestFields(manifest, {
      privateOptions: true,
      path: true,
    });
    expect(shaped).to.deep.equal(manifest);
  });

  it("drops private options while keeping paths", () => {
    const shaped = stripPrivateManifestFields(buildManifest(), {
      privateOptions: false,
      path: true,
    });
    for (const module of shaped.modules) {
      expect(module).to.not.have.property("privateOptions");
    }
    expect(shaped.modules[0].path).to.equal(
      "/srv/app/node_modules/@scope/dms/frontend",
    );
  });

  it("drops paths while keeping private options", () => {
    const shaped = stripPrivateManifestFields(buildManifest(), {
      privateOptions: true,
      path: false,
    });
    for (const module of shaped.modules) {
      expect(module).to.not.have.property("path");
    }
    expect(shaped.modules[0].privateOptions).to.deep.equal({
      oauth: { relaySecret: "s3cret" },
    });
  });

  it("drops both for an anonymous caller", () => {
    const shaped = stripPrivateManifestFields(buildManifest(), {
      privateOptions: false,
      path: false,
    });
    for (const module of shaped.modules) {
      expect(module).to.not.have.property("privateOptions");
      expect(module).to.not.have.property("path");
    }
  });

  it("leaves every other field untouched", () => {
    const shaped = stripPrivateManifestFields(buildManifest(), {
      privateOptions: false,
      path: false,
    });
    expect(shaped.pack).to.equal("/dms/frontend/modules");
    expect(shaped.modules[0].name).to.equal("@scope/dms-frontend");
    expect(shaped.modules[0].archiveName).to.equal("@scope-dms-frontend");
    expect(shaped.modules[0].priority).to.equal(0);
    expect(shaped.modules[0].configKey).to.equal("dms");
    expect(shaped.modules[0].options).to.deep.equal({
      baseURL: "https://api.example.com",
    });
  });

  it("never mutates the registry it was given", () => {
    const manifest = buildManifest();
    stripPrivateManifestFields(manifest, {
      privateOptions: false,
      path: false,
    });
    expect(manifest).to.deep.equal(buildManifest());
  });
});
