import fs from "node:fs";
import type { OpResult } from "@antelopejs/interface-dms-builder";
import { expect } from "chai";
import { GetTheme, SetTheme } from "../../../implementations/dms-builder";
import { offContractTheme, type Sent } from "./helpers/off-contract";
import { destroyFixture, expectOk } from "./harness";
import {
  brandingFiles,
  configDraft,
  createThemeFixture,
  draft,
  JPEG_LOGO,
  layerPath,
  OP_TIMEOUT,
  PNG_LOGO,
  SVG_LOGO,
  upload,
  writeLayerFile,
} from "./helpers/theme-harness";

const OTHER_PNG = Buffer.concat([PNG_LOGO, Buffer.from([1])]);

function issues(result: OpResult<unknown>): Array<[string, string]> {
  return !result.ok && result.error.code === "invalid_config"
    ? result.error.issues.map((issue) => [issue.pointer, issue.message])
    : [];
}

function pointers(result: OpResult<unknown>): string[] {
  return issues(result).map(([pointer]) => pointer);
}

function checksUploadedFileTypes(): void {
  it("writes a JPEG, for the email as for any other slot", async () => {
    expectOk(
      await SetTheme(
        configDraft({
          uploads: [
            upload("default", "light", JPEG_LOGO, "image/jpeg"),
            upload("email", "light", JPEG_LOGO, "image/jpeg"),
          ],
        }),
      ),
      "SetTheme",
    );
    const theme = expectOk(await GetTheme(), "GetTheme");
    expect(theme.logos.default?.light).to.match(
      /^\/branding\/default-light-[0-9a-f]{8}\.jpg$/,
    );
    expect(theme.logos.email?.light).to.equal(theme.logos.default?.light);
  });

  it("refuses a file that is not what its type says", async () => {
    const result = await SetTheme(
      configDraft({
        uploads: [upload("default", "light", PNG_LOGO, "image/jpeg")],
      }),
    );
    expect(issues(result)).to.deep.equal([
      ["/uploads/0", "the file is not a JPG image"],
    ]);
  });

  it("takes only a PNG or a JPEG for the email, and writes nothing else", async () => {
    const result = await SetTheme(
      configDraft({
        uploads: [
          upload("email", "light", SVG_LOGO, "image/svg+xml"),
          upload("email", "dark", Buffer.from("RIFF0000WEBP"), "image/webp"),
          upload("email", "dark", Buffer.from([0, 0, 1, 0]), "image/x-icon"),
        ],
      }),
    );
    expect(pointers(result)).to.deep.equal([
      "/uploads/0",
      "/uploads/1",
      "/uploads/2",
    ]);
    expect(brandingFiles()).to.deep.equal([]);
  });
}

function deletesUnusedEmailLogoFiles(): void {
  it("deletes the email logo a new one replaces", async () => {
    expectOk(
      await SetTheme(
        configDraft({
          uploads: [upload("email", "light", PNG_LOGO, "image/png")],
        }),
      ),
      "SetTheme",
    );
    expectOk(
      await SetTheme(
        configDraft({
          uploads: [upload("email", "light", OTHER_PNG, "image/png")],
        }),
      ),
      "SetTheme",
    );
    const theme = expectOk(await GetTheme(), "GetTheme");
    expect(brandingFiles()).to.deep.equal([
      theme.logos.email?.light?.replace("/branding/", ""),
    ]);
  });

  it("keeps a file the email still points at, and deletes it once nothing does", async () => {
    expectOk(
      await SetTheme(
        configDraft({
          uploads: [upload("default", "light", PNG_LOGO, "image/png")],
        }),
      ),
      "SetTheme",
    );
    const shared =
      expectOk(await GetTheme(), "GetTheme").logos.default?.light ?? "";
    expectOk(
      await SetTheme(configDraft({ logos: { email: { light: shared } } })),
      "SetTheme",
    );
    expect(fs.existsSync(layerPath(`public${shared}`))).to.equal(true);
    expectOk(await SetTheme(configDraft()), "SetTheme");
    expect(brandingFiles()).to.deep.equal([]);
  });
}

function keepsLogoFilesTheAppConfigReaches(): void {
  it("keeps a file a slot reaches through a constant of the app config", async () => {
    expectOk(
      await SetTheme(
        configDraft({
          uploads: [upload("default", "light", PNG_LOGO, "image/png")],
        }),
      ),
      "SetTheme",
    );
    const shared =
      expectOk(await GetTheme(), "GetTheme").logos.default?.light ?? "";
    writeLayerFile(
      "app/app.config.ts",
      `const EMAIL_LOGO = "${shared}";\nexport default defineDmsAppConfig({\n  branding: { logo: { default: { light: "${shared}" }, email: { light: EMAIL_LOGO } } },\n});\n`,
    );
    expectOk(await SetTheme(configDraft()), "SetTheme");
    expect(fs.existsSync(layerPath(`public${shared}`))).to.equal(true);
  });

  it("keeps a file a slot reaches through a constant another file exports", async () => {
    expectOk(
      await SetTheme(
        configDraft({
          uploads: [upload("default", "light", PNG_LOGO, "image/png")],
        }),
      ),
      "SetTheme",
    );
    const shared =
      expectOk(await GetTheme(), "GetTheme").logos.default?.light ?? "";
    writeLayerFile("app/brand/paths.ts", `export * from "./logos";\n`);
    writeLayerFile(
      "app/brand/logos.ts",
      `export const EMAIL_LOGO = "${shared}";\n`,
    );
    writeLayerFile(
      "app/app.config.ts",
      `import { EMAIL_LOGO } from "~/brand/paths";\nexport default defineDmsAppConfig({\n  branding: { logo: { default: { light: "${shared}" }, email: { light: EMAIL_LOGO } } },\n});\n`,
    );
    expectOk(await SetTheme(configDraft()), "SetTheme");
    expect(fs.existsSync(layerPath(`public${shared}`))).to.equal(true);
  });

  it("keeps a file a slot reaches through a template literal with a substitution", async () => {
    expectOk(
      await SetTheme(
        configDraft({
          uploads: [upload("default", "light", PNG_LOGO, "image/png")],
        }),
      ),
      "SetTheme",
    );
    const shared =
      expectOk(await GetTheme(), "GetTheme").logos.default?.light ?? "";
    const fileName = shared.slice(shared.lastIndexOf("/") + 1);
    writeLayerFile(
      "app/app.config.ts",
      `const DIRECTORY = "/branding";\nexport default defineDmsAppConfig({\n  branding: { logo: { default: { light: "${shared}" }, email: { light: \`\${DIRECTORY}/${fileName}\` } } },\n});\n`,
    );
    expectOk(await SetTheme(configDraft()), "SetTheme");
    expect(fs.existsSync(layerPath(`public${shared}`))).to.equal(true);
  });

  it("keeps a file a slot reaches through a file name built only from substitutions, and deletes it once nothing builds it", async () => {
    expectOk(
      await SetTheme(
        configDraft({
          uploads: [upload("default", "light", PNG_LOGO, "image/png")],
        }),
      ),
      "SetTheme",
    );
    const shared =
      expectOk(await GetTheme(), "GetTheme").logos.default?.light ?? "";
    const hash = /-([0-9a-f]{8})\.png$/.exec(shared)?.[1] ?? "";
    const builtConfig = (extension: string): string =>
      `const SLOT = "default";\nconst HASH = "${hash}";\nexport default defineDmsAppConfig({\n  branding: { logo: { default: { light: "${shared}" }, email: { light: \`/branding/\${SLOT}-light-\${HASH}.${extension}\` } } },\n});\n`;
    writeLayerFile("app/app.config.ts", builtConfig("png"));
    expectOk(await SetTheme(configDraft()), "SetTheme");
    expect(fs.existsSync(layerPath(`public${shared}`))).to.equal(true);
    writeLayerFile("app/app.config.ts", builtConfig("jpg"));
    expectOk(await SetTheme(configDraft()), "SetTheme");
    expect(brandingFiles()).to.deep.equal([]);
  });

  it("keeps a file another file builds only from substitutions", async () => {
    expectOk(
      await SetTheme(
        configDraft({
          uploads: [upload("default", "light", PNG_LOGO, "image/png")],
        }),
      ),
      "SetTheme",
    );
    const shared =
      expectOk(await GetTheme(), "GetTheme").logos.default?.light ?? "";
    const hash = /-([0-9a-f]{8})\.png$/.exec(shared)?.[1] ?? "";
    writeLayerFile(
      "app/brand/logos.ts",
      `const SLOT = "default";\nconst HASH = "${hash}";\nexport const EMAIL_LOGO_NAME = \`\${SLOT}-light-\${HASH}.png\`;\n`,
    );
    writeLayerFile(
      "app/app.config.ts",
      `import { EMAIL_LOGO_NAME } from "~/brand/logos";\nexport default defineDmsAppConfig({\n  branding: { logo: { default: { light: "${shared}" }, email: { light: "/branding/" + EMAIL_LOGO_NAME } } },\n});\n`,
    );
    expectOk(await SetTheme(configDraft()), "SetTheme");
    expect(fs.existsSync(layerPath(`public${shared}`))).to.equal(true);
  });
}

function writesOneFileOrNothing(): void {
  it("writes one file for the email and another slot sent the same bytes", async () => {
    expectOk(
      await SetTheme(
        configDraft({
          uploads: [
            upload("default", "light", PNG_LOGO, "image/png"),
            upload("email", "light", PNG_LOGO, "image/png"),
          ],
        }),
      ),
      "SetTheme",
    );
    const theme = expectOk(await GetTheme(), "GetTheme");
    expect(theme.logos.email?.light).to.equal(theme.logos.default?.light);
    expect(brandingFiles()).to.have.length(1);
  });

  it("writes only the last of two uploads for one slot and mode", async () => {
    expectOk(
      await SetTheme(
        configDraft({
          uploads: [
            upload("default", "light", PNG_LOGO, "image/png"),
            upload("default", "light", OTHER_PNG, "image/png"),
          ],
        }),
      ),
      "SetTheme",
    );
    const theme = expectOk(await GetTheme(), "GetTheme");
    expect(brandingFiles()).to.deep.equal([
      theme.logos.default?.light?.replace("/branding/", ""),
    ]);
  });

  it("refuses an SVG that is no image once sanitized, and writes nothing", async () => {
    const result = await SetTheme(
      draft({
        uploads: [
          upload("default", "light", `${SVG_LOGO}${SVG_LOGO}`, "image/svg+xml"),
        ],
      }),
    );
    expect(pointers(result)).to.deep.equal(["/uploads/0"]);
    expect(fs.existsSync(layerPath("app/assets/css/theme.css"))).to.equal(
      false,
    );
  });
}

describe("theme logo files", function () {
  this.timeout(OP_TIMEOUT);

  beforeEach(() => {
    createThemeFixture();
  });

  afterEach(() => {
    destroyFixture();
  });

  checksUploadedFileTypes();
  deletesUnusedEmailLogoFiles();
  keepsLogoFilesTheAppConfigReaches();
  writesOneFileOrNothing();
});

describe("theme draft shape", function () {
  this.timeout(OP_TIMEOUT);

  beforeEach(() => {
    createThemeFixture();
  });

  afterEach(() => {
    destroyFixture();
  });

  /** Save what a request may hold, typed or not. */
  function save(body: Sent): ReturnType<typeof SetTheme> {
    return SetTheme(offContractTheme(body));
  }

  it("answers a missing draft as invalid rather than failing", async () => {
    expect(pointers(await save(undefined))).to.deep.equal([""]);
    expect(pointers(await save({ colors: {}, logos: {} }))).to.deep.equal([
      "/variables",
    ]);
  });

  it("points at every value that is not a string", async () => {
    const result = await save({
      variables: { shared: {}, light: { "--ui-bg": 3 }, dark: [] },
      colors: { primary: null },
      logos: { default: "/branding/logo.svg", email: { light: false } },
      uploads: [
        {
          slot: "default",
          mode: "light",
          contentType: "image/png",
          base64Content: 42,
        },
        "logo.png",
      ],
    });
    expect(pointers(result)).to.deep.equal([
      "/variables/light/--ui-bg",
      "/variables/dark",
      "/colors/primary",
      "/logos/default",
      "/logos/email/light",
      "/uploads/0/base64Content",
      "/uploads/1",
    ]);
  });
});
