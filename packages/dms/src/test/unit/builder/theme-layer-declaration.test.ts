import fs from "node:fs";
import path from "node:path";
import { expect } from "chai";
import {
  CreateThemeLayer,
  GetTheme,
} from "../../../implementations/dms-builder";
import { scaffoldThemeLayer } from "../../../implementations/dms-builder/engine";
import { destroyFixture, expectOk, type Fixture } from "./harness";
import { discoverFrontendModule } from "./helpers/frontend-discovery";
import {
  createThemeFixture,
  ENTRY_SOURCE,
  LAYER,
  OP_TIMEOUT,
  readLayerFile,
  readProjectManifest,
  readProjectManifestText,
  writeLayerFile,
  writeProjectManifest,
} from "./helpers/theme-harness";

/** The entry the builder wrote before it declared the module: the layer is registered at run time only. */
const UNDECLARED_ENTRY = `import path from "node:path";
import "./home";
import { AddFrontendModule } from "@antelopejs/interface-dms/page";

export function construct(): void {}

export async function start(): Promise<void> {
  await AddFrontendModule({
    name: "shop-frontend",
    sourcePath: path.join(__dirname, "../frontend-vue"),
    renderer: { name: "vue", version: "3" },
    priority: 1,
  });}
`;

const DECLARED_ENTRY = `import "./home";
import { AddFrontendModule } from "@antelopejs/interface-dms/page";
import { frontendModule } from "./frontend-module";

export function construct(): void {}

export async function start(): Promise<void> {
  await AddFrontendModule(frontendModule());
}
`;

const FRONTEND_MODULE = `import path from "node:path";
import type { FrontendModuleRegistration } from "@antelopejs/interface-dms/page";

/**
 * The project's frontend module: the backend passes it to \`AddFrontendModule\`,
 * and \`package.json\` names its compiled file as \`dmsFrontend\`, which is how
 * \`ajs dms dev\` and \`ajs dms build\` find the layer. It imports nothing at run
 * time but Node.js built-ins, because the frontend loader loads this file on
 * its own.
 */
export function frontendModule(): FrontendModuleRegistration {
  return {
    name: "shop-frontend",
    sourcePath: path.join(__dirname, "../frontend-vue"),
    renderer: { name: "vue", version: "3" },
    priority: 1,
  };
}
`;

let app: Fixture;

describe("creating a theme layer", function () {
  this.timeout(OP_TIMEOUT);

  beforeEach(() => {
    app = createThemeFixture({ withLayer: false });
    app.write("home.ts", "export {};\n");
    app.write(
      "index.ts",
      'import "./home";\n\nexport function construct(): void {}\n',
    );
  });

  afterEach(() => {
    destroyFixture();
  });

  it("declares it for the frontend loader, which then finds the layer", () => {
    expectOk(scaffoldThemeLayer(), "scaffoldThemeLayer");
    expect(readProjectManifest().dmsFrontend).to.equal(
      "dist/frontend-module.js",
    );
    const found = discoverFrontendModule(app.root);
    expect(found?.name).to.equal("shop-frontend");
    expect(found?.sourcePath).to.equal(path.join(app.root, LAYER));
    expect(found?.renderer).to.deep.equal({ name: "vue", version: "3" });
    expect(found?.priority).to.equal(1);
  });

  it("registers that same declaration from start(), written as a formatter would", () => {
    expectOk(scaffoldThemeLayer(), "scaffoldThemeLayer");
    expect(app.read("frontend-module.ts")).to.equal(FRONTEND_MODULE);
    expect(app.read("index.ts")).to.equal(DECLARED_ENTRY);
  });

  it("keeps the other fields of the project's package.json and its indentation", () => {
    writeProjectManifest({ main: "dist/index.js", scripts: { build: "tsc" } });
    expectOk(scaffoldThemeLayer(), "scaffoldThemeLayer");
    const text = readProjectManifestText();
    expect(readProjectManifest()).to.deep.equal({
      name: "shop",
      version: "0.0.1",
      private: true,
      main: "dist/index.js",
      scripts: { build: "tsc" },
      dmsFrontend: "dist/frontend-module.js",
    });
    expect(text).to.match(/^ {2}"dmsFrontend": /m);
    expect(text.endsWith("}\n")).to.equal(true);
  });

  it("refuses a project whose package.json names no compiled entry, and writes nothing", () => {
    writeProjectManifest({ main: undefined });
    const entry = app.read("index.ts");
    const result = scaffoldThemeLayer();
    expect(!result.ok && result.error.code).to.equal("unsupported");
    expect(app.read("index.ts")).to.equal(entry);
    expect(fs.existsSync(path.join(app.root, LAYER))).to.equal(false);
    expect(app.exists("frontend-module.ts")).to.equal(false);
  });

  it("refuses a barrel that already binds frontendModule, and writes nothing", () => {
    app.write("home.ts", "export const frontendModule = 1;\n");
    app.write(
      "index.ts",
      'import { frontendModule } from "./home";\n\nexport function construct(): void {\n  frontendModule;\n}\n',
    );
    const entry = app.read("index.ts");
    const manifest = readProjectManifestText();
    const result = scaffoldThemeLayer();
    expect(!result.ok && result.error.code).to.equal("unsupported");
    expect(app.read("index.ts")).to.equal(entry);
    expect(readProjectManifestText()).to.equal(manifest);
    expect(app.exists("frontend-module.ts")).to.equal(false);
    expect(fs.existsSync(path.join(app.root, LAYER))).to.equal(false);
  });

  it("is idempotent: a second call changes no file", async () => {
    expectOk(scaffoldThemeLayer(), "scaffoldThemeLayer");
    const files = ["index.ts", "frontend-module.ts"].map((name) =>
      app.read(name),
    );
    const manifest = readProjectManifestText();
    const again = await CreateThemeLayer();
    expect(expectOk(again, "CreateThemeLayer").name).to.equal("shop-frontend");
    expect(again.ok && again.changes.every(({ diff }) => diff === "")).to.equal(
      true,
    );
    expect(
      ["index.ts", "frontend-module.ts"].map((name) => app.read(name)),
    ).to.deep.equal(files);
    expect(readProjectManifestText()).to.equal(manifest);
  });
});

describe("a layer registered at run time that no package.json declares", function () {
  this.timeout(OP_TIMEOUT);

  beforeEach(() => {
    app = createThemeFixture();
    app.write("home.ts", "export {};\n");
    app.write("index.ts", UNDECLARED_ENTRY);
  });

  afterEach(() => {
    destroyFixture();
  });

  it("reads back as undeclared, so the editor can say the theme is not live", async () => {
    const theme = expectOk(await GetTheme(), "GetTheme");
    expect(theme.declaration).to.deep.equal({
      declared: false,
      manifest: path.join(app.root, "package.json"),
    });
    expect(discoverFrontendModule(app.root)).to.equal(undefined);
  });

  it("is repaired by CreateThemeLayer: the declaration is written and the layer is found", async () => {
    expectOk(await CreateThemeLayer(), "CreateThemeLayer");
    expect(app.read("frontend-module.ts")).to.equal(FRONTEND_MODULE);
    expect(app.read("index.ts")).to.equal(DECLARED_ENTRY);
    expect(readProjectManifest().dmsFrontend).to.equal(
      "dist/frontend-module.js",
    );
    expect(discoverFrontendModule(app.root)?.sourcePath).to.equal(
      path.join(app.root, LAYER),
    );
    const theme = expectOk(await GetTheme(), "GetTheme");
    expect(theme.declaration.declared).to.equal(true);
  });

  it("leaves the layer's own files alone", async () => {
    writeLayerFile("dms.frontend.ts", ENTRY_SOURCE);
    expectOk(await CreateThemeLayer(), "CreateThemeLayer");
    expect(readLayerFile("dms.frontend.ts")).to.equal(ENTRY_SOURCE);
  });

  it("repairs once: a second call changes nothing", async () => {
    expectOk(await CreateThemeLayer(), "CreateThemeLayer");
    const again = await CreateThemeLayer();
    expectOk(again, "CreateThemeLayer");
    expect(again.ok && again.changes).to.deep.equal([]);
  });

  it("declares a module the project already wrote, and writes nothing else", async () => {
    app.write("frontend-module.ts", FRONTEND_MODULE);
    app.write("index.ts", DECLARED_ENTRY);
    expectOk(await CreateThemeLayer(), "CreateThemeLayer");
    expect(app.read("frontend-module.ts")).to.equal(FRONTEND_MODULE);
    expect(app.read("index.ts")).to.equal(DECLARED_ENTRY);
    expect(readProjectManifest().dmsFrontend).to.equal(
      "dist/frontend-module.js",
    );
  });

  it("refuses a registration it does not recognize, and changes nothing", async () => {
    const entry = `import { AddFrontendModule } from "@antelopejs/interface-dms/page";\n\nexport async function start(): Promise<void> {\n  await AddFrontendModule({ name: "x", sourcePath: "/elsewhere", renderer: { name: "vue", version: "3" } });\n}\n`;
    app.write("index.ts", entry);
    const result = await CreateThemeLayer();
    expect(!result.ok && result.error.code).to.equal("unsupported");
    expect(app.read("index.ts")).to.equal(entry);
    expect(readProjectManifest().dmsFrontend).to.equal(undefined);
  });
});

describe("a layer that is declared", function () {
  this.timeout(OP_TIMEOUT);

  afterEach(() => {
    destroyFixture();
  });

  it("reads back as declared and is returned unchanged", async () => {
    app = createThemeFixture();
    writeProjectManifest({ dmsFrontend: "dist/frontend-module.js" });
    const theme = expectOk(await GetTheme(), "GetTheme");
    expect(theme.declaration.declared).to.equal(true);
    const result = await CreateThemeLayer();
    expectOk(result, "CreateThemeLayer");
    expect(result.ok && result.changes).to.deep.equal([]);
  });
});
