import fs from "node:fs";
import path from "node:path";
import { expect } from "chai";
import { GetTheme, SetTheme } from "../../../implementations/dms-builder";
import {
  projectLayer,
  scaffoldThemeLayer,
  emitStylesheet,
  parseStylesheet,
} from "../../../implementations/dms-builder/engine";
import { destroyFixture, expectOk, type Fixture } from "./harness";
import {
  directoryNames,
  fileBytes,
  fileText,
  pathExists,
} from "./helpers/file-text";
import {
  createThemeFixture,
  draft,
  ENTRY_SOURCE,
  LAYER,
  layerPath,
  OP_TIMEOUT,
  PNG_LOGO,
  readLayerFile,
  SVG_LOGO,
  upload,
  writeLayerFile,
} from "./helpers/theme-harness";

let app: Fixture;

describe("theme stylesheet", () => {
  it("writes the shared rule, then one per mode, declarations sorted", () => {
    const text = emitStylesheet({
      shared: { "--ui-radius": "0.5rem", "--font-sans": "Inter, sans-serif" },
      light: { "--ui-bg": "#fafafa" },
      dark: { "--ui-bg": "#111111" },
    });
    expect(text).to.equal(
      ":root {\n  --font-sans: Inter, sans-serif;\n  --ui-radius: 0.5rem;\n}\n\n:root:not(.dark) {\n  --ui-bg: #fafafa;\n}\n\n.dark {\n  --ui-bg: #111111;\n}\n",
    );
    expect(parseStylesheet(text).variables).to.deep.equal({
      shared: { "--font-sans": "Inter, sans-serif", "--ui-radius": "0.5rem" },
      light: { "--ui-bg": "#fafafa" },
      dark: { "--ui-bg": "#111111" },
    });
  });

  it("keeps a value set for light alone out of dark mode", () => {
    expect(
      emitStylesheet({ shared: {}, light: { "--ui-bg": "snow" }, dark: {} }),
    ).to.equal(":root:not(.dark) {\n  --ui-bg: snow;\n}\n");
  });

  it("writes nothing for a theme without overrides", () => {
    expect(emitStylesheet({ shared: {}, light: {}, dark: {} })).to.equal("");
  });

  it("reads a file with another rule as opaque rather than dropping it", () => {
    const parsed = parseStylesheet(
      ":root { --a: 1px; }\nbody { color: red; }\n",
    );
    expect(parsed.variables).to.equal(undefined);
    expect(parsed.opaqueReason).to.be.a("string");
  });

  it("reads two rules under one selector as one, the later winning", () => {
    const parsed = parseStylesheet(
      ".dark { --a: first; --b: kept; }\n.dark { --a: second; }\n",
    );
    expect(parsed.variables?.dark).to.deep.equal({
      "--a": "second",
      "--b": "kept",
    });
  });
});

function writesStylesheetAndPalettes(): void {
  it("reads a layer that has no theme yet", async () => {
    const theme = expectOk(await GetTheme(), "GetTheme");
    expect(theme.variables).to.deep.equal({ shared: {}, light: {}, dark: {} });
    expect(theme.colors).to.deep.equal({ primary: "violet" });
    expect(theme.logos).to.deep.equal({});
    expect(theme.stylesheetImported).to.equal(false);
    expect(theme.layer.sourcePath).to.equal(path.join(app.root, LAYER));
  });

  it("writes the stylesheet and imports it from the entry, once", async () => {
    const first = expectOk(await SetTheme(draft()), "SetTheme");
    expect(readLayerFile("app/assets/css/theme.css")).to.equal(
      ":root:not(.dark) {\n  --ui-bg: #fafafa;\n}\n\n.dark {\n  --ui-bg: #111111;\n}\n",
    );
    expectOk(
      await SetTheme(
        draft({
          variables: { shared: {}, light: {}, dark: { "--ui-bg": "#000" } },
        }),
        { expectedVersion: first.version },
      ),
      "SetTheme",
    );
    const entry = readLayerFile("dms.frontend.ts");
    expect(entry.split('import "./app/assets/css/theme.css";')).to.have.length(
      2,
    );
    expect(entry).to.contain("sdk.registerComponent");
    const theme = expectOk(await GetTheme(), "GetTheme");
    expect(theme.stylesheetImported).to.equal(true);
    expect(theme.variables.dark).to.deep.equal({ "--ui-bg": "#000" });
  });

  it("leaves a layer without an app config without one when no palette or logo is set", async () => {
    fs.rmSync(layerPath("app/app.config.ts"));
    expectOk(await SetTheme(draft({ colors: {} })), "SetTheme");
    expect(pathExists(layerPath("app/app.config.ts"))).to.equal(false);
  });

  it("writes the palettes under ui.colors and keeps the rest of ui", async () => {
    expectOk(
      await SetTheme(draft({ colors: { primary: "emerald", error: "rose" } })),
      "SetTheme",
    );
    const config = readLayerFile("app/app.config.ts");
    expect(config).to.contain('primary: "emerald"');
    expect(config).to.contain('error: "rose"');
    expect(config).to.contain('button: { slots: { base: "font-bold" } }');
    expectOk(await SetTheme(draft({ colors: {} })), "SetTheme");
    const emptied = readLayerFile("app/app.config.ts");
    expect(emptied).not.to.contain("colors");
    expect(emptied).to.contain("button");
  });

  it("refuses to write a palette into a ui object it cannot read, and writes nothing", async () => {
    writeLayerFile(
      "app/app.config.ts",
      'const ui = { colors: { primary: "violet" } };\n\nexport default { ui };\n',
    );
    const result = await SetTheme(draft({ colors: { primary: "rose" } }));
    expect(!result.ok && result.error.code).to.equal("unsupported");
    expect(pathExists(layerPath("app/assets/css/theme.css"))).to.equal(false);
  });

  it("refuses a palette name that is not one", async () => {
    const result = await SetTheme(
      draft({ colors: { primary: 'violet" } evil' } }),
    );
    expect(!result.ok && result.error.code).to.equal("invalid_config");
  });
}

function writesSanitizedLogos(): void {
  it("writes a logo under public/branding and points the app config at it", async () => {
    const result = await SetTheme(
      draft({
        uploads: [
          upload("default", "light", SVG_LOGO, "image/svg+xml"),
          upload("default", "dark", PNG_LOGO, "image/png"),
        ],
      }),
    );
    const saved = expectOk(result, "SetTheme");
    expect(result.ok && result.warnings).to.equal(undefined);
    const theme = expectOk(await GetTheme(), "GetTheme");
    expect(theme.version).to.equal(saved.version);
    const light = theme.logos.default?.light ?? "";
    const dark = theme.logos.default?.dark ?? "";
    expect(light).to.match(/^\/branding\/default-light-[0-9a-f]{8}\.svg$/);
    expect(dark).to.match(/^\/branding\/default-dark-[0-9a-f]{8}\.png$/);
    expect(fileText(path.join(app.root, LAYER, "public", light))).to.match(
      /^<svg[^>]*viewBox="0 0 8 8"><rect width="8" height="8">/,
    );
    expect(fileBytes(path.join(app.root, LAYER, "public", dark))).to.deep.equal(
      PNG_LOGO,
    );
  });

  it("takes scripts and outside references out of an SVG, and says so", async () => {
    const unsafe =
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect onclick="alert(1)" width="8" height="8"/><use href="https://elsewhere.test/x.svg#a"/></svg>';
    const result = await SetTheme(
      draft({ uploads: [upload("favicon", "dark", unsafe, "image/svg+xml")] }),
    );
    expectOk(result, "SetTheme");
    expect(
      result.ok && result.warnings?.map((warning) => warning.code),
    ).to.deep.equal(["svg_sanitized"]);
    const theme = expectOk(await GetTheme(), "GetTheme");
    const written = fileText(
      path.join(app.root, LAYER, "public", theme.logos.favicon?.dark ?? ""),
    );
    expect(written).not.to.match(/script|onclick|elsewhere/);
    expect(written).to.contain('<rect width="8" height="8">');
  });

  it("refuses an SVG nothing of which is left once sanitized, and writes nothing", async () => {
    const result = await SetTheme(
      draft({
        uploads: [
          upload(
            "default",
            "light",
            "<script><svg></svg></script>",
            "image/svg+xml",
          ),
        ],
      }),
    );
    expect(!result.ok && result.error.code).to.equal("invalid_config");
    expect(pathExists(layerPath("app/assets/css/theme.css"))).to.equal(false);
  });
}

function sharesAndCleansUpLogoFiles(): void {
  it("writes one file for a logo sent for several slots", async () => {
    expectOk(
      await SetTheme(
        draft({
          uploads: [
            upload("default", "light", PNG_LOGO, "image/png"),
            upload("collapsed", "light", PNG_LOGO, "image/png"),
            upload("favicon", "light", PNG_LOGO, "image/png"),
          ],
        }),
      ),
      "SetTheme",
    );
    const theme = expectOk(await GetTheme(), "GetTheme");
    const written = theme.logos.default?.light;
    expect(written).to.match(/^\/branding\/default-light-[0-9a-f]{8}\.png$/);
    expect(theme.logos.collapsed?.light).to.equal(written);
    expect(theme.logos.favicon?.light).to.equal(written);
    expect(directoryNames(layerPath("public/branding"))).to.have.length(1);
  });

  it("warns once about an SVG sent for several slots", async () => {
    const unsafe =
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect width="8" height="8"/></svg>';
    const result = await SetTheme(
      draft({
        uploads: [
          upload("default", "dark", unsafe, "image/svg+xml"),
          upload("favicon", "dark", unsafe, "image/svg+xml"),
        ],
      }),
    );
    expectOk(result, "SetTheme");
    expect(
      result.ok && result.warnings?.map((warning) => warning.message),
    ).to.deep.equal([
      "The dark logo (default, favicon) held scripts, event handlers or references to other files: they were taken out of the saved SVG.",
    ]);
  });

  it("deletes the builder's own logo once nothing points at it", async () => {
    expectOk(
      await SetTheme(
        draft({
          uploads: [upload("collapsed", "light", PNG_LOGO, "image/png")],
        }),
      ),
      "SetTheme",
    );
    const first = expectOk(await GetTheme(), "GetTheme");
    const written = first.logos.collapsed?.light ?? "";
    expectOk(
      await SetTheme(draft({ logos: {} }), { expectedVersion: first.version }),
      "SetTheme",
    );
    expect(pathExists(path.join(app.root, LAYER, "public", written))).to.equal(
      false,
    );
    expect(readLayerFile("app/app.config.ts")).not.to.contain("branding");
  });
}

function refusesUnsafeOrStaleWrites(): void {
  it("refuses a value that would end the declaration", async () => {
    const result = await SetTheme(
      draft({
        variables: {
          shared: {},
          light: { "--ui-bg": "red; } body { color: red" },
          dark: {},
        },
      }),
    );
    expect(!result.ok && result.error.code).to.equal("invalid_config");
  });

  it("answers stale when the theme changed on disk since it was read", async () => {
    const theme = expectOk(await GetTheme(), "GetTheme");
    writeLayerFile(
      "app/assets/css/theme.css",
      ":root {\n  --ui-radius: 1rem;\n}\n",
    );
    const result = await SetTheme(draft(), { expectedVersion: theme.version });
    expect(!result.ok && result.error.code).to.equal("stale");
  });

  it("will not rewrite a stylesheet holding rules it did not write", async () => {
    writeLayerFile("app/assets/css/theme.css", "body { margin: 0; }\n");
    const result = await SetTheme(draft());
    expect(!result.ok && result.error.code).to.equal("unsupported");
    expect(readLayerFile("app/assets/css/theme.css")).to.equal(
      "body { margin: 0; }\n",
    );
  });
}

describe("theme", function () {
  this.timeout(OP_TIMEOUT);

  beforeEach(() => {
    app = createThemeFixture();
  });

  afterEach(() => {
    destroyFixture();
  });

  writesStylesheetAndPalettes();
  writesSanitizedLogos();
  sharesAndCleansUpLogoFiles();
  refusesUnsafeOrStaleWrites();
});

describe("the project's layer", () => {
  const root = "/work/shop";
  const module = (sourcePath: string, priority: number) => ({
    name: path.basename(sourcePath),
    sourcePath,
    priority,
  });

  it("is one the project registers from its own sources, the highest first", () => {
    const layer = projectLayer(root, [
      module("/work/shop/frontend-vue", 1),
      module("/work/shop/admin-vue", 5),
      module("/work/dms-builder/frontend-vue", 100),
    ]);
    expect(layer?.sourcePath).to.equal("/work/shop/admin-vue");
  });

  it("is never a module installed in the project, by a package manager or by AntelopeJS", () => {
    const layer = projectLayer(root, [
      module("/work/shop/node_modules/@acme/billing/frontend-vue", 3),
      module("/work/shop/.antelope/cache/@antelopejs/dms/frontend-vue", 0),
    ]);
    expect(layer).to.equal(undefined);
  });
});

describe("theme layer", function () {
  this.timeout(OP_TIMEOUT);

  beforeEach(() => {
    app = createThemeFixture({ withLayer: false });
  });

  afterEach(() => {
    destroyFixture();
  });

  it("creates frontend-vue and registers it from a start() it adds", () => {
    const result = scaffoldThemeLayer();
    const layer = expectOk(result, "scaffoldThemeLayer");
    expect(layer.sourcePath).to.equal(path.join(app.root, LAYER));
    expect(readLayerFile("dms.frontend.ts")).to.contain(
      'import "./app/assets/css/theme.css";',
    );
    expect(JSON.parse(readLayerFile("package.json"))).to.include({
      main: "./dms.frontend.ts",
      private: true,
    });
    const entry = app.read("index.ts");
    expect(entry).to.match(/^import path from "node:path";/);
    expect(entry).to.contain(
      'import { AddFrontendModule } from "@antelopejs/interface-dms/page";',
    );
    expect(entry).to.contain("export async function start(): Promise<void> {");
    expect(entry).to.contain(
      'sourcePath: path.join(__dirname, "../frontend-vue"),',
    );
    expect(entry).to.contain("priority: 1,");
    expect(readLayerFile("app/assets/css/theme.css")).to.equal("");
    expect(result.ok && result.changes.length).to.equal(4);
  });

  it("makes an existing start() async and registers the layer at its end", () => {
    app.write(
      "index.ts",
      'export function construct(): void {}\n\nexport function start(): void {\n  console.log("started");\n}\n',
    );
    expectOk(scaffoldThemeLayer(), "scaffoldThemeLayer");
    expect(app.read("index.ts")).to.match(
      /export async function start\(\): Promise<void> \{\n {2}console\.log\("started"\);\n {2}await AddFrontendModule\(\{/,
    );
  });

  it("neither registers the layer twice nor overwrites its files", () => {
    expectOk(scaffoldThemeLayer(), "scaffoldThemeLayer");
    writeLayerFile("dms.frontend.ts", ENTRY_SOURCE);
    const again = scaffoldThemeLayer();
    expectOk(again, "scaffoldThemeLayer");
    expect(readLayerFile("dms.frontend.ts")).to.equal(ENTRY_SOURCE);
    expect(app.read("index.ts").split("AddFrontendModule(")).to.have.length(2);
  });
});
