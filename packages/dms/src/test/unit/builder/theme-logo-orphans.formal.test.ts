import fs from "node:fs";
import path from "node:path";
import { expect } from "chai";
import fc from "fast-check";
import { Project, type SourceFile } from "ts-morph";
import { GetTheme, SetTheme } from "../../../implementations/dms-builder";
import {
  logoPaths,
  readLogos,
  stringLiterals,
} from "../../../implementations/dms-builder/engine/theme-app-config";
import { orphanedAssets } from "../../../implementations/dms-builder/engine/theme-assets";
import {
  type ReachedStrings,
  reachableStrings,
} from "../../../implementations/dms-builder/engine/theme-config-imports";
import { destroyFixture, expectOk } from "./harness";
import {
  appConfigFor,
  IMPORT_SPECIFIERS,
  namesFile,
  type Spelling,
  spellings,
} from "./helpers/logo-spellings";
import {
  configDraft,
  createThemeFixture,
  layerPath,
  OP_TIMEOUT,
  PNG_LOGO,
  upload,
  writeLayerFile,
} from "./helpers/theme-harness";

const SEED = 20261116;
const RUNS = 400;
const SAVED_PUBLIC = "public";

/** How a version of `orphanedAssets` was told which strings the app config reaches. */
type Reach = (appConfig: SourceFile) => ReachedStrings;

/**
 * The reach of `SetTheme` before each fix of the orphan cleanup, rebuilt from
 * the pieces the engine still exports: what it read, and what it left unread.
 */
const REACH_BEFORE_FIX = {
  "#985, which read the logo paths of the saved config alone": (appConfig) => ({
    literals: new Set(logoPaths(readLogos(appConfig))),
    builtFileNames: [],
  }),
  "#999, which read the literals of the app config alone": (appConfig) => ({
    literals: stringLiterals(appConfig),
    builtFileNames: [],
  }),
  "#1010, which read the literals of the config and its imports alone": (
    appConfig,
  ) => ({
    literals: reachableStrings(appConfig).literals,
    builtFileNames: [],
  }),
} satisfies Record<string, Reach>;

async function uploadedLogoPath(): Promise<string> {
  createThemeFixture();
  try {
    expectOk(
      await SetTheme(
        configDraft({
          uploads: [upload("default", "light", PNG_LOGO, "image/png")],
        }),
      ),
      "SetTheme",
    );
    return expectOk(await GetTheme(), "GetTheme").logos.default?.light ?? "";
  } finally {
    destroyFixture();
  }
}

/**
 * Writes the logo, then an app config that spells it with `spelling`, and
 * returns the logo's file when the next save has to keep it.
 */
async function layerWith(
  spelling: Spelling,
  specifier: string,
): Promise<{ filePath: string; value: string }> {
  expectOk(
    await SetTheme(
      configDraft({
        uploads: [upload("default", "light", PNG_LOGO, "image/png")],
      }),
    ),
    "SetTheme",
  );
  const publicPath =
    expectOk(await GetTheme(), "GetTheme").logos.default?.light ?? "";
  const config = appConfigFor(spelling, publicPath, specifier);
  writeLayerFile("app/brand/logos.ts", config.logosSource);
  writeLayerFile("app/brand/paths.ts", config.pathsSource);
  writeLayerFile("app/app.config.ts", config.source);
  return {
    filePath: layerPath(path.join(SAVED_PUBLIC, publicPath)),
    value: config.value,
  };
}

function appConfigOf(): SourceFile {
  return new Project({
    compilerOptions: { noLib: true },
  }).addSourceFileAtPath(layerPath("app/app.config.ts"));
}

/** The property `SetTheme` must hold: the file the saved config can name survives a save of another slot. */
function keepsReachableFile(
  publicPath: string,
): fc.IAsyncProperty<[Spelling, string]> {
  const fileName = path.posix.basename(publicPath);
  return fc.asyncProperty(
    spellings(publicPath),
    fc.constantFrom(...IMPORT_SPECIFIERS),
    async (spelling, specifier) => {
      createThemeFixture();
      try {
        const { filePath, value } = await layerWith(spelling, specifier);
        fc.pre(namesFile(value, fileName));
        expectOk(await SetTheme(configDraft()), "SetTheme");
        return fs.existsSync(filePath);
      } finally {
        destroyFixture();
      }
    },
  );
}

/** The same property, asked of the orphan check of an older fix instead of the whole save. */
function reachNeverMissesFile(
  publicPath: string,
  reach: Reach,
): fc.IAsyncProperty<[Spelling, string]> {
  const fileName = path.posix.basename(publicPath);
  return fc.asyncProperty(
    spellings(publicPath),
    fc.constantFrom(...IMPORT_SPECIFIERS),
    async (spelling, specifier) => {
      createThemeFixture();
      try {
        const { filePath, value } = await layerWith(spelling, specifier);
        fc.pre(namesFile(value, fileName));
        expectOk(await SetTheme(configDraft()), "SetTheme");
        const orphans = orphanedAssets(
          layerPath(SAVED_PUBLIC),
          { default: { light: publicPath } },
          reach(appConfigOf()),
        );
        return !orphans.includes(filePath);
      } finally {
        destroyFixture();
      }
    },
  );
}

describe("formal: SetTheme keeps every logo file the app config can produce", function () {
  this.timeout(OP_TIMEOUT * 20);

  let publicPath = "";

  before(async () => {
    publicPath = await uploadedLogoPath();
  });

  it("deletes no file the saved config reaches through constants, imports, templates, +, concat, join and URL encoding", async () => {
    const outcome = await fc.check(keepsReachableFile(publicPath), {
      seed: SEED,
      numRuns: RUNS,
    });
    expect(outcome.failed, fc.defaultReportMessage(outcome)).to.equal(false);
  });

  for (const [fix, reach] of Object.entries(REACH_BEFORE_FIX)) {
    it(`finds a spelling the orphan check before ${fix}, loses`, async () => {
      const outcome = await fc.check(reachNeverMissesFile(publicPath, reach), {
        seed: SEED,
        numRuns: RUNS,
      });
      expect(outcome.failed).to.equal(true);
    });
  }
});

/** The app config a finding spells, from the hash of the uploaded logo. */
type FindingConfig = (publicPath: string, hash: string) => string;

const FINDINGS = {
  "F1: a name joined from a constant array": (publicPath, hash) =>
    `const PARTS = ["default", "light", "${hash}.png"];\nexport default defineDmsAppConfig({\n  branding: { logo: { default: { light: "${publicPath}" }, email: { light: "/branding/" + PARTS.join("-") } } },\n});\n`,
  "F2: a constant that holds a path separator beside text of the name": (
    publicPath,
    hash,
  ) =>
    `const DIRECTORY = "ing/";\nexport default defineDmsAppConfig({\n  branding: { logo: { default: { light: "${publicPath}" }, email: { light: "/brand" + DIRECTORY + "default-light-" + "${hash}.png" } } },\n});\n`,
  "F3: a name spelled by constants alone": (publicPath, hash) =>
    `const SLOT = "default-";\nconst REST = "light-${hash}.png";\nexport default defineDmsAppConfig({\n  branding: { logo: { default: { light: "${publicPath}" }, email: { light: "/branding/" + SLOT + REST } } },\n});\n`,
} satisfies Record<string, FindingConfig>;

describe("formal: findings of the orphan cleanup on the code today", function () {
  this.timeout(OP_TIMEOUT);

  beforeEach(() => {
    createThemeFixture();
  });

  afterEach(() => {
    destroyFixture();
  });

  for (const [finding, configFor] of Object.entries(FINDINGS)) {
    it(`${finding}: SetTheme still deletes the file the config names`, async () => {
      expectOk(
        await SetTheme(
          configDraft({
            uploads: [upload("default", "light", PNG_LOGO, "image/png")],
          }),
        ),
        "SetTheme",
      );
      const publicPath =
        expectOk(await GetTheme(), "GetTheme").logos.default?.light ?? "";
      const hash = /-([0-9a-f]{8})\.png$/.exec(publicPath)?.[1] ?? "";
      writeLayerFile("app/app.config.ts", configFor(publicPath, hash));
      expectOk(await SetTheme(configDraft()), "SetTheme");
      expect(
        fs.existsSync(layerPath(path.join(SAVED_PUBLIC, publicPath))),
        `${finding} no longer reproduces: remove it from FINDINGS and from SKILL.md`,
      ).to.equal(false);
    });
  }
});
