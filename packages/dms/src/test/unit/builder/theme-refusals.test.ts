import fs from "node:fs";
import { expect } from "chai";
import {
  CreateThemeLayer,
  GetTheme,
  SetTheme,
} from "../../../implementations/dms-builder";
import { scaffoldThemeLayer } from "../../../implementations/dms-builder/engine";
import { destroyFixture, expectOk, type Fixture } from "./harness";
import {
  configDraft,
  createThemeFixture,
  draft,
  layerPath,
  OP_TIMEOUT,
  PNG_LOGO,
  readLayerFile,
  upload,
} from "./helpers/theme-harness";

const STYLESHEET = "app/assets/css/theme.css";
const APP_CONFIG = "app/app.config.ts";

describe("theme refusals", function () {
  this.timeout(OP_TIMEOUT);

  afterEach(() => {
    destroyFixture();
  });

  it("refuses a value that fetches a resource or raises its priority, and writes nothing", async () => {
    createThemeFixture();
    for (const value of [
      'image-set("https://example.com/x.png" 1x)',
      '-webkit-image-set("https://example.com/x.png" 1x)',
      'src("https://example.com/x.png")',
      'image("https://example.com/x.png")',
      "red ! important",
      "red !\timportant",
    ]) {
      const result = await SetTheme(
        draft({
          variables: { shared: { "--ui-x": value }, light: {}, dark: {} },
        }),
      );
      expect(!result.ok && result.error.code, value).to.equal("invalid_config");
    }
    expect(() => readLayerFile(STYLESHEET)).to.throw();
  });

  it("refuses a logo whose content type names an Object member, rather than failing", async () => {
    createThemeFixture();
    for (const contentType of ["constructor", "__proto__", "toString"]) {
      for (const slot of ["default", "email"] as const) {
        const result = await SetTheme(
          configDraft({
            uploads: [upload(slot, "light", PNG_LOGO, contentType)],
          }),
        );
        expect(
          !result.ok && result.error.code,
          `${contentType} ${slot}`,
        ).to.equal("invalid_config");
      }
    }
  });

  it("refuses an app config whose default export is a call on several objects", async () => {
    const appConfig = `declare function mergeConfigs<T>(...configs: T[]): T;\n\nexport default mergeConfigs(\n  { ui: { colors: { primary: "violet" } } },\n  { ui: { colors: { primary: "emerald" } } },\n);\n`;
    createThemeFixture({ appConfig });
    const result = await SetTheme(configDraft({ colors: { primary: "rose" } }));
    expect(!result.ok && result.error.code).to.equal("unsupported");
    expect(readLayerFile(APP_CONFIG)).to.equal(appConfig);
  });

  it("lets one of two saves from the same version through and answers the other stale", async () => {
    createThemeFixture();
    const { version } = expectOk(await GetTheme(), "GetTheme");
    const results = await Promise.all(
      (["rose", "teal"] as const).map((primary) =>
        SetTheme(configDraft({ colors: { primary } }), {
          expectedVersion: version,
        }),
      ),
    );
    expect(results.map((result) => result.ok)).to.deep.equal([true, false]);
    expect(!results[1]?.ok && results[1]?.error.code).to.equal("stale");
    expect(readLayerFile(APP_CONFIG)).to.contain('primary: "rose"');
  });

  it("refuses to create a layer the module config names but the disk lacks, and creates nothing", async () => {
    createThemeFixture();
    fs.rmSync(layerPath(""), { recursive: true });
    const result = await CreateThemeLayer();
    expect(!result.ok && result.error.code).to.equal("unsupported");
    expect(fs.existsSync(layerPath(""))).to.equal(false);
  });

  it("refuses a layer the module config names whose entry is missing, as GetTheme does", async () => {
    createThemeFixture();
    fs.rmSync(layerPath("dms.frontend.ts"));
    const result = await CreateThemeLayer();
    expect(!result.ok && result.error.code).to.equal("unsupported");
    const theme = await GetTheme();
    expect(!theme.ok && theme.error.code).to.equal("not_found");
  });

  describe("registering the layer", () => {
    let app: Fixture;

    beforeEach(() => {
      app = createThemeFixture({ withLayer: false });
    });

    for (const [name, source] of [
      [
        "returns a value",
        "export function start() {\n  return init();\n}\n\nfunction init(): void {}\n",
      ],
      [
        "returns early",
        'export async function start(): Promise<void> {\n  if (Date.now() > 0) {\n    return;\n  }\n  console.log("started");\n}\n',
      ],
    ] as const) {
      it(`refuses a start() that ${name}, and changes nothing`, () => {
        app.write("index.ts", source);
        const result = scaffoldThemeLayer();
        expect(!result.ok && result.error.code).to.equal("unsupported");
        expect(app.read("index.ts")).to.equal(source);
      });
    }

    it("still registers in a start() whose nested function returns", () => {
      app.write(
        "index.ts",
        "export function start(): void {\n  [1].map((n) => {\n    return n;\n  });\n}\n",
      );
      const result = scaffoldThemeLayer();
      expect(result.ok).to.equal(true);
      expect(app.read("index.ts")).to.contain("await AddFrontendModule(");
    });
  });
});
