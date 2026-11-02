import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect } from "chai";
import {
  findDependents,
  findImplementations,
  findInterfaceVersion,
  findMissingInterfaces,
  loadedManifest,
  runningFrontend,
} from "../../../store";
import type { RuntimeModule } from "../../../store";
import {
  AddFrontendModule,
  frontendModuleVersions,
} from "../../../store/frontend";

const INTERFACE = "@acme/interface-jobs";
const INTERFACE_PACKAGE = "@antelopejs/interface-dms";
const FRONTEND_PACKAGE = "@antelopejs/dms-frontend";
const REGISTRY_URL =
  "https://raw.githubusercontent.com/AntelopeJS/interfaces/main/";
const LISTED = { name: "jobs", package: "@acme/jobs" };
const LISTED_MODULE = {
  name: LISTED.name,
  source: { type: "package", package: LISTED.package },
};

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

let root: string;

async function writePackage(folder: string, manifest: Json): Promise<void> {
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, "package.json"), JSON.stringify(manifest));
}

async function outcomeOf(run: () => Promise<object>): Promise<string> {
  try {
    await run();
    return "resolved";
  } catch {
    return "rejected";
  }
}

describe("[unit] store/boundaries — package manifests read from disk", () => {
  before(async () => {
    root = await mkdtemp(path.join(tmpdir(), "dms-store-boundaries-"));
  });
  after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("skips an interface manifest whose version is not a string and walks up", async () => {
    const outer = path.join(root, "interface");
    await writePackage(outer, { name: INTERFACE_PACKAGE, version: "1.2.3" });
    await writePackage(path.join(outer, "dist"), {
      name: INTERFACE_PACKAGE,
      version: 5,
    });
    expect(findInterfaceVersion(path.join(outer, "dist"))).to.equal("1.2.3");
  });

  it("finds no running frontend in an installed manifest whose version is not a string", async () => {
    const project = path.join(root, "no-frontend");
    await writePackage(path.join(project, "node_modules", FRONTEND_PACKAGE), {
      version: 5,
    });
    expect(runningFrontend(project)).to.equal(undefined);
  });

  it("reads the installed frontend version of a project", async () => {
    const project = path.join(root, "frontend");
    await writePackage(path.join(project, "node_modules", FRONTEND_PACKAGE), {
      version: "0.10.0",
    });
    expect(runningFrontend(project)).to.deep.equal({
      version: "0.10.0",
      source: "project",
    });
  });

  it("reports no package version for a frontend module whose package version is not a string", async () => {
    const shipped = path.join(root, "shipping-number");
    await writePackage(shipped, { version: 5 });
    AddFrontendModule({
      name: "boundaries-shipping-number",
      sourcePath: path.join(shipped, "src"),
      renderer: { name: "boundaries", version: "1" },
    });
    const versions = frontendModuleVersions();
    expect(versions.has("boundaries-shipping-number")).to.equal(true);
    expect(versions.get("boundaries-shipping-number")).to.equal(undefined);
  });

  it("reports the package version of a frontend module", async () => {
    const shipped = path.join(root, "shipping-string");
    await writePackage(shipped, { version: "2.0.1" });
    AddFrontendModule({
      name: "boundaries-shipping-string",
      sourcePath: path.join(shipped, "src"),
      renderer: { name: "boundaries", version: "1" },
    });
    expect(frontendModuleVersions().get("boundaries-shipping-string")).to.equal(
      "2.0.1",
    );
  });

  it("lists a loaded module from its manifest, leaving out a field of the wrong type", async () => {
    const folder = path.join(root, "loaded");
    await writePackage(folder, { name: "@acme/jobs", version: 5 });
    const manifest = await loadedManifest(folder);
    expect(manifest.name).to.equal("@acme/jobs");
    expect(manifest.version).to.equal(undefined);
  });

  it("reads a loaded module with no readable manifest as an empty one", async () => {
    const manifest = await loadedManifest(path.join(root, "absent"));
    expect(manifest.name).to.equal(undefined);
    expect(manifest.version).to.equal(undefined);
  });

  for (const content of [null, "jobs", 5, [], true]) {
    it(`rejects a loaded module whose manifest is ${JSON.stringify(content)}`, async () => {
      const folder = path.join(root, `loaded-${JSON.stringify(content)}`);
      await writePackage(folder, content);
      expect(await outcomeOf(() => loadedManifest(folder))).to.equal(
        "rejected",
      );
    });
  }
});

describe("[unit] store/boundaries — dependents read from module manifests", () => {
  async function moduleAt(id: string, manifest: Json): Promise<RuntimeModule> {
    const localPath = path.join(root, "dependents", id);
    await writePackage(localPath, manifest);
    return {
      id,
      packageName: id,
      isPackageSource: true,
      status: "active",
      localPath,
    };
  }

  before(async () => {
    root = await mkdtemp(path.join(tmpdir(), "dms-store-dependents-"));
  });
  after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("does not count a dependency range that is not a string as a dependent", async () => {
    const provider = await moduleAt("jobs", {
      name: "jobs",
      antelopeJs: { implements: [INTERFACE] },
    });
    const numeric = await moduleAt("numeric", {
      name: "numeric",
      dependencies: { [INTERFACE]: 1 },
    });
    const listed = await moduleAt("listed", {
      name: "listed",
      dependencies: { [INTERFACE]: "^1.0.0" },
    });
    const project = await moduleAt("project", { name: "project" });
    expect(
      await findDependents(
        provider,
        [provider, numeric, listed, project],
        project.localPath,
      ),
    ).to.deep.equal({ modules: ["listed"], usedByProject: false });
  });
});

const REGISTRY_ROOT = "manifest.json";
const REGISTRY_DOCUMENTS = new Map<string, Json>([
  [
    REGISTRY_ROOT,
    {
      interfaces: {
        "@acme/interface-listed": "listed",
        "@acme/interface-mixed": "mixed",
        "@acme/interface-nulled": "nulled",
        "@acme/interface-junk": "junk",
        "@acme/interface-badfolder": 5,
      },
    },
  ],
  [
    "interfaces/listed/manifest.json",
    { modules: [LISTED_MODULE, { name: "git", source: { type: "git" } }] },
  ],
  [
    "interfaces/mixed/manifest.json",
    {
      modules: [
        { name: "numeric", source: { type: "package", package: 5 } },
        LISTED_MODULE,
      ],
    },
  ],
  ["interfaces/nulled/manifest.json", { modules: [null, LISTED_MODULE] }],
  ["interfaces/junk/manifest.json", { modules: ["junk", LISTED_MODULE] }],
  ["interfaces/5/manifest.json", { modules: [LISTED_MODULE] }],
]);

const NPM_ANSWERS = new Map<string, Json>([
  ["@acme/interface-nulled@^1.0.0", {}],
  ["@acme/interface-listed@^1.0.0", { standalone: false }],
  ["@acme/interface-notmanifest@^1.0.0", ["x"]],
  ["@acme/interface-severalreleases@^1.0.0", [{ standalone: true }, {}]],
  ["@acme/interface-standalone@^1.0.0", { standalone: true }],
  ["@acme/interface-implementer@^1.0.0", { implements: ["@acme/other"] }],
]);

/** A stand-in for the `npm` the store runs, answering from a table of `npm view` answers. */
const NPM_STAND_IN = `#!/usr/bin/env node
const { readFileSync } = require("node:fs");
const answers = JSON.parse(readFileSync(process.env.NPM_STAND_IN_ANSWERS, "utf8"));
const spec = process.argv[3];
if (Object.hasOwn(answers, spec)) process.stdout.write(JSON.stringify(answers[spec]));
else process.exit(1);
`;

describe("[unit] store/boundaries — interfaces registry", () => {
  const originalFetch = globalThis.fetch;
  const originalPath = process.env.PATH;
  let project: string;

  before(async () => {
    project = await mkdtemp(path.join(tmpdir(), "dms-store-registry-"));
    const binFolder = path.join(project, "bin");
    await mkdir(binFolder);
    await writeFile(path.join(binFolder, "npm"), NPM_STAND_IN, {
      mode: 0o755,
    });
    await writeFile(
      path.join(project, "answers.json"),
      JSON.stringify(Object.fromEntries(NPM_ANSWERS)),
    );
    process.env.NPM_STAND_IN_ANSWERS = path.join(project, "answers.json");
    process.env.PATH = `${binFolder}${path.delimiter}${originalPath}`;
    globalThis.fetch = async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      const file = url.slice(REGISTRY_URL.length);
      const document = REGISTRY_DOCUMENTS.get(file);
      return document === undefined
        ? Response.json({}, { status: 404 })
        : Response.json(document);
    };
  });
  after(async () => {
    globalThis.fetch = originalFetch;
    process.env.PATH = originalPath;
    delete process.env.NPM_STAND_IN_ANSWERS;
    await rm(project, { recursive: true, force: true });
  });

  const missingOf = (...dependencies: string[]) =>
    findMissingInterfaces(
      {
        version: "1.0.0",
        dependencies: Object.fromEntries(
          dependencies.map((name) => [name, "^1.0.0"]),
        ),
      },
      new Set(),
      project,
    );

  it("lists the npm modules of an interface", async () => {
    expect(await findImplementations("@acme/interface-listed")).to.deep.equal([
      LISTED,
    ]);
  });

  it("does not list a module whose package is not a string", async () => {
    expect(await findImplementations("@acme/interface-mixed")).to.deep.equal([
      LISTED,
    ]);
  });

  it("lists no module when the module list holds a null", async () => {
    expect(await findImplementations("@acme/interface-nulled")).to.deep.equal(
      [],
    );
  });

  it("lists no module when the module list holds a non-object", async () => {
    expect(await findImplementations("@acme/interface-junk")).to.deep.equal([]);
  });

  it("looks in no folder when the registry names a folder that is not a string", async () => {
    expect(
      await findImplementations("@acme/interface-badfolder"),
    ).to.deep.equal([]);
  });

  it("offers no candidate for a missing interface whose module list holds a null", async () => {
    expect(await missingOf("@acme/interface-nulled")).to.deep.equal([
      { interfacePackage: "@acme/interface-nulled", candidates: [] },
    ]);
  });

  it("offers the candidates of a missing interface", async () => {
    expect(await missingOf("@acme/interface-listed")).to.deep.equal([
      { interfacePackage: "@acme/interface-listed", candidates: [LISTED] },
    ]);
  });

  it("takes a dependency whose npm answer is no manifest for a library", async () => {
    expect(await missingOf("@acme/interface-notmanifest")).to.deep.equal([]);
  });

  it("takes a dependency that implements another package for a library", async () => {
    expect(await missingOf("@acme/interface-implementer")).to.deep.equal([]);
  });

  it("does not require a standalone interface", async () => {
    expect(await missingOf("@acme/interface-standalone")).to.deep.equal([]);
  });

  it("lets the newest of several releases decide", async () => {
    expect(
      (await missingOf("@acme/interface-severalreleases")).map(
        (missing) => missing.interfacePackage,
      ),
    ).to.deep.equal(["@acme/interface-severalreleases"]);
  });
});
