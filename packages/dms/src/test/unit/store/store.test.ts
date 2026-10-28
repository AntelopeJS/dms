import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { HTTPResult } from "@antelopejs/interface-api";
import { expect } from "chai";
import { loadStoreCatalog, readCatalogDocument } from "../../../store/catalog";
import { isCompatible } from "../../../store/compatibility";
import { findDependents, isProjectModule } from "../../../store/interfaces";
import { packageDeclarationSource } from "../../../store/declarations";
import { supportsFrontend } from "../../../store/frontend-compatibility";
import { findWorkingCopy, isLive, sourceKindOf } from "../../../store/runtime";
import { startStoreOperation } from "../../../store/operations";
import { readTarFile } from "../../../store/tarball";
import { storeInstallSchema } from "../../../validation/store.schema";
import type { RuntimeModule } from "../../../store/types";

const HTTP_FORBIDDEN = 403;

function runtimeModule(status: string): RuntimeModule {
  return {
    id: "@antelopejs/dms-lang",
    packageName: "@antelopejs/dms-lang",
    isPackageSource: true,
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

  it("finds a running working copy of a catalog package, never an npm one", () => {
    const local = { ...runtimeModule("active"), isPackageSource: false };
    const stopped = { ...local, id: "stopped", status: "loaded" };
    const npm = runtimeModule("active");
    expect(findWorkingCopy("@antelopejs/dms-lang", [npm, stopped])).to.equal(
      undefined,
    );
    expect(findWorkingCopy("@antelopejs/dms-lang", [npm, local])).to.equal(
      local,
    );
    expect(findWorkingCopy("@antelopejs/dms-media", [local])).to.equal(
      undefined,
    );
  });
});

describe("[unit] store/runtime sources", () => {
  it("names a module's source after where its code comes from", () => {
    expect(sourceKindOf({ type: "package", package: "@acme/a" })).to.equal(
      "npm",
    );
    expect(sourceKindOf({ type: "local" })).to.equal("local");
    expect(sourceKindOf({ type: "local-folder" })).to.equal("local");
    expect(
      sourceKindOf({ type: "git", remote: "https://github.com/acme/a.git" }),
    ).to.equal("github");
    expect(
      sourceKindOf({ type: "git", remote: "git@gitlab.acme.io:team/a.git" }),
    ).to.equal("gitlab");
    expect(
      sourceKindOf({ type: "git", remote: "ssh://git@code.acme.io/a.git" }),
    ).to.equal("git");
  });
});

describe("[unit] store/production", () => {
  it("refuses to change a module outside development", async () => {
    const refusal = await startStoreOperation(
      "install",
      "@antelopejs/dms-lang",
    ).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(refusal).to.be.instanceOf(HTTPResult);
    expect((refusal as HTTPResult).getStatus()).to.equal(HTTP_FORBIDDEN);
    expect((refusal as HTTPResult).getBody()).to.equal("error.store_disabled");
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

function tarEntry(name: string, content: string): Buffer {
  const header = Buffer.alloc(512);
  header.write(name, 0);
  header.write(`${content.length.toString(8).padStart(11, "0")}\0`, 124);
  header.write("0", 156);
  const body = Buffer.alloc(Math.ceil(content.length / 512) * 512);
  body.write(content);
  return Buffer.concat([header, body]);
}

describe("[unit] store/tarball", () => {
  it("reads one file of an npm archive by its path in the package", () => {
    const archive = Buffer.concat([
      tarEntry("package/package.json", '{"name":"a"}'),
      tarEntry("package/frontend-vue/package.json", '{"engines":{}}'),
      Buffer.alloc(1024),
    ]);
    expect(
      readTarFile(archive, "frontend-vue/package.json")?.toString(),
    ).to.equal('{"engines":{}}');
    expect(readTarFile(archive, "missing.json")).to.equal(undefined);
  });
});

describe("[unit] store/frontend-compatibility", () => {
  it("checks a prerelease as the release it leads to", () => {
    expect(supportsFrontend(">=0.6.0 <0.7.0", "0.6.0")).to.equal(true);
    expect(supportsFrontend(">=0.6.0 <0.7.0", "0.7.0-next.1")).to.equal(false);
    expect(supportsFrontend("<0.6.0", "0.6.0")).to.equal(false);
  });
});

describe("[unit] validation/store", () => {
  const install = (packageName: string) =>
    storeInstallSchema.safeParse({
      id: "lang",
      dependencies: [
        {
          interfacePackage: "@antelopejs/interface-redis",
          package: packageName,
        },
      ],
    }).success;

  it("takes an npm package for a dependency", () => {
    expect(install("@antelopejs/redis")).to.equal(true);
    expect(install("redis-module")).to.equal(true);
  });

  it("refuses a git, URL or local source for a dependency", () => {
    expect(install("git+https://github.com/a/b.git")).to.equal(false);
    expect(install("../redis")).to.equal(false);
    expect(install("file:/tmp/redis")).to.equal(false);
    expect(install("github:a/b")).to.equal(false);
  });
});

describe("[unit] store/interfaces", () => {
  const INTERFACE = "@acme/interface-jobs";
  let root: string;

  async function moduleAt(
    id: string,
    manifest: Record<string, unknown>,
  ): Promise<RuntimeModule> {
    const localPath = path.join(root, id);
    await mkdir(localPath, { recursive: true });
    await writeFile(
      path.join(localPath, "package.json"),
      JSON.stringify({ name: id, ...manifest }),
    );
    return {
      id,
      packageName: id,
      isPackageSource: true,
      status: "active",
      localPath,
    };
  }

  before(async () => {
    root = await mkdtemp(path.join(tmpdir(), "dms-store-"));
  });
  after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("tells the project apart from the modules that need an interface", async () => {
    const provider = await moduleAt("jobs", {
      antelopeJs: { implements: [INTERFACE] },
    });
    const consumer = await moduleAt("reports", {
      dependencies: { [INTERFACE]: "^1.0.0" },
    });
    const project = await moduleAt("project", {
      dependencies: { [INTERFACE]: "^1.0.0" },
    });
    const projectPath = project.localPath;
    expect(isProjectModule(project, projectPath)).to.equal(true);
    expect(isProjectModule(consumer, projectPath)).to.equal(false);

    expect(
      await findDependents(
        provider,
        [provider, consumer, project],
        projectPath,
      ),
    ).to.deep.equal({ modules: ["reports"], usedByProject: true });
    expect(
      await findDependents(provider, [provider, project], projectPath),
    ).to.deep.equal({ modules: [], usedByProject: true });
  });
});
