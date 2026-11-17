import fs from "node:fs";
import type { OpResult, ThemeDraft } from "@antelopejs/interface-dms-builder";
import { expect } from "chai";
import { GetTheme, SetTheme } from "../../../implementations/dms-builder";
import { destroyFixture, expectOk } from "./harness";
import {
  configDraft,
  createThemeFixture,
  layerPath,
  OP_TIMEOUT,
  readLayerFile,
} from "./helpers/theme-harness";

const APP_CONFIG = "app/app.config.ts";

/**
 * An app config holding some of the theme's keys in code of its own: an
 * expression, a constant, a path imported from elsewhere.
 */
const AUTHORED_CONFIG = `import { logo } from "./brand";

const accent = "teal";

export default defineDmsAppConfig({
  ui: {
    colors: {
      primary: process.env.BRAND ?? "violet",
      success: accent,
      warning: "amber",
    },
  },
  branding: {
    logo: {
      default: { light: logo, dark: "/branding/dark.svg" },
    },
  },
});
`;

const SHORTHAND_CONFIG = `const primary = "violet";

export default defineDmsAppConfig({
  ui: { colors: { primary } },
});
`;

const SPREAD_CONFIG = `const base = { success: "lime" };

export default defineDmsAppConfig({
  ui: { colors: { ...base, primary: "violet" } },
});
`;

/** The theme as the editor reads it, sent back with `overrides` on top. */
async function readBack(
  overrides: Partial<ThemeDraft> = {},
): Promise<ThemeDraft> {
  const theme = expectOk(await GetTheme(), "GetTheme");
  return {
    variables: theme.variables,
    colors: theme.colors,
    logos: theme.logos,
    ...overrides,
  };
}

function refusal(result: OpResult<unknown>): string {
  return !result.ok && result.error.code === "unsupported"
    ? result.error.detail
    : `not refused: ${JSON.stringify(result)}`;
}

function issuePointers(result: OpResult<unknown>): string[] {
  return !result.ok && result.error.code === "invalid_config"
    ? result.error.issues.map((issue) => issue.pointer)
    : [];
}

describe("theme app config written by hand", function () {
  this.timeout(OP_TIMEOUT);

  afterEach(() => {
    destroyFixture();
  });

  it("reads only the literals, and writes the file back unchanged", async () => {
    createThemeFixture({ appConfig: AUTHORED_CONFIG });
    const read = await readBack();
    expect(read.colors).to.deep.equal({ warning: "amber" });
    expect(read.logos).to.deep.equal({
      default: { dark: "/branding/dark.svg" },
    });
    expectOk(await SetTheme(read), "SetTheme");
    expect(readLayerFile(APP_CONFIG)).to.equal(AUTHORED_CONFIG);
  });

  it("sets another key and keeps the keys held in code", async () => {
    createThemeFixture({ appConfig: AUTHORED_CONFIG });
    const read = await readBack();
    expectOk(
      await SetTheme({
        ...read,
        colors: { ...read.colors, error: "rose" },
        logos: { default: { dark: "/branding/night.svg" } },
      }),
      "SetTheme",
    );
    const config = readLayerFile(APP_CONFIG);
    expect(config).to.contain('primary: process.env.BRAND ?? "violet",');
    expect(config).to.contain("success: accent,");
    expect(config).to.contain('error: "rose"');
    expect(config).to.contain(
      'default: { light: logo, dark: "/branding/night.svg" }',
    );
  });

  it("drops a literal the draft leaves out, never a key held in code", async () => {
    createThemeFixture({ appConfig: AUTHORED_CONFIG });
    expectOk(
      await SetTheme(await readBack({ colors: {}, logos: {} })),
      "SetTheme",
    );
    const config = readLayerFile(APP_CONFIG);
    expect(config).not.to.contain("warning");
    expect(config).not.to.contain("/branding/dark.svg");
    expect(config).to.contain('primary: process.env.BRAND ?? "violet",');
    expect(config).to.contain("success: accent");
    expect(config).to.contain("default: { light: logo }");
  });

  it("refuses to overwrite a key held in code, naming it, and writes nothing", async () => {
    createThemeFixture({ appConfig: AUTHORED_CONFIG });
    const read = await readBack();
    const result = await SetTheme({
      ...read,
      colors: { ...read.colors, primary: "rose" },
      logos: { default: { light: "/branding/day.svg" } },
    });
    expect(refusal(result)).to.contain("ui.colors.primary");
    expect(refusal(result)).to.contain("branding.logo.default.light");
    expect(readLayerFile(APP_CONFIG)).to.equal(AUTHORED_CONFIG);
  });

  it("refuses to write a palette over a shorthand rather than set it twice", async () => {
    createThemeFixture({ appConfig: SHORTHAND_CONFIG });
    expect((await readBack()).colors).to.deep.equal({});
    const result = await SetTheme(configDraft({ colors: { primary: "rose" } }));
    expect(refusal(result)).to.contain("ui.colors.primary");
    expectOk(await SetTheme(configDraft({ colors: {} })), "SetTheme");
    expect(readLayerFile(APP_CONFIG)).to.equal(SHORTHAND_CONFIG);
  });

  it("changes nothing in an object with a spread, and keeps what the read saw there", async () => {
    createThemeFixture({ appConfig: SPREAD_CONFIG });
    const read = await readBack();
    expect(read.colors).to.deep.equal({ primary: "violet" });
    expectOk(await SetTheme(read), "SetTheme");
    expect(readLayerFile(APP_CONFIG)).to.equal(SPREAD_CONFIG);
    const added = await SetTheme(
      await readBack({ colors: { primary: "violet", error: "rose" } }),
    );
    expect(refusal(added)).to.contain("ui.colors.error");
    const dropped = await SetTheme(await readBack({ colors: {} }));
    expect(refusal(dropped)).to.contain("ui.colors.primary");
    expect(readLayerFile(APP_CONFIG)).to.equal(SPREAD_CONFIG);
  });

  it("creates an app config in the form the loader documents", async () => {
    createThemeFixture();
    fs.rmSync(layerPath(APP_CONFIG));
    expectOk(
      await SetTheme(configDraft({ colors: { primary: "emerald" } })),
      "SetTheme",
    );
    const config = readLayerFile(APP_CONFIG);
    expect(config).to.match(/^export default defineDmsAppConfig\(\{\n/);
    expect(config).to.contain('primary: "emerald"');
  });
});

describe("theme logo paths", function () {
  this.timeout(OP_TIMEOUT);

  beforeEach(() => {
    createThemeFixture();
  });

  afterEach(() => {
    destroyFixture();
  });

  it("refuses a path a browser reads as another host's", async () => {
    const result = await SetTheme(
      configDraft({ logos: { default: { light: "//evil.example/x.svg" } } }),
    );
    expect(issuePointers(result)).to.deep.equal(["/logos/default/light"]);
  });

  it("takes only a PNG or a JPEG for the email", async () => {
    const svg = await SetTheme(
      configDraft({ logos: { email: { light: "/branding/logo.svg" } } }),
    );
    expect(issuePointers(svg)).to.deep.equal(["/logos/email/light"]);
    expectOk(
      await SetTheme(
        configDraft({
          logos: {
            email: { light: "/branding/logo.jpg", dark: "/branding/logo.PNG" },
          },
        }),
      ),
      "SetTheme",
    );
  });
});
