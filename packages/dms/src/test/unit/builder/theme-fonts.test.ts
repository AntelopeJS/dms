import fs from "node:fs";
import { expect } from "chai";
import type { ThemeVariableSets } from "@antelopejs/interface-dms-builder";
import { GetTheme, SetTheme } from "../../../implementations/dms-builder";
import {
  HOSTED_FONTS,
  fontFaceRules,
  hostedFontsOf,
  emitStylesheet,
  parseStylesheet,
} from "../../../implementations/dms-builder/engine";
import { destroyFixture, expectOk } from "./harness";
import {
  brandingFiles,
  createThemeFixture,
  draft,
  layerPath,
  OP_TIMEOUT,
  readLayerFile,
  writeLayerFile,
} from "./helpers/theme-harness";

const STYLESHEET = "app/assets/css/theme.css";
const FONT_FILES = "public/branding/fonts";
const WOFF2 = Buffer.concat([Buffer.from("wOF2"), Buffer.alloc(12)]);
const LICENSE =
  "Copyright 2016 The Inter Project Authors\n\nThis Font Software is licensed under the SIL Open Font License, Version 1.1.\n";

const INTER_FILES = [
  "inter-5.3.0-OFL.txt",
  "inter-5.3.0-latin-ext-wght-italic.woff2",
  "inter-5.3.0-latin-ext-wght-normal.woff2",
  "inter-5.3.0-latin-wght-italic.woff2",
  "inter-5.3.0-latin-wght-normal.woff2",
];

function withFont(stack: string | undefined): ThemeVariableSets {
  return {
    shared: stack ? { "--font-sans": stack } : {},
    light: {},
    dark: {},
  };
}

const realFetch = globalThis.fetch;
let requestedUrls: string[] = [];

/** Answer every font request as the CDN would, or as `respond` says. */
function serveFonts(
  respond: (url: string) => Response = (url) =>
    new Response(url.endsWith("/LICENSE") ? LICENSE : new Uint8Array(WOFF2)),
): void {
  requestedUrls = [];
  globalThis.fetch = async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input);
    requestedUrls.push(url);
    return respond(url);
  };
}

describe("theme fonts", () => {
  it("hosts the catalog font a value starts with, not one it falls back to", () => {
    expect(
      hostedFontsOf(withFont('"Inter", ui-sans-serif, sans-serif')).map(
        (font) => font.family,
      ),
    ).to.deep.equal(["Inter"]);
    expect(
      hostedFontsOf(withFont("'source serif 4', serif")).map(
        (font) => font.family,
      ),
    ).to.deep.equal(["Source Serif 4"]);
    expect(
      hostedFontsOf(withFont('"Geist", "Inter", sans-serif')),
    ).to.deep.equal([]);
    expect(hostedFontsOf(withFont("Comic Sans MS, cursive"))).to.deep.equal([]);
  });

  it("declares one face per style and subset, and reads them back", () => {
    const manrope = HOSTED_FONTS.filter((font) => font.family === "Manrope");
    const text = emitStylesheet(
      withFont('"Manrope", sans-serif'),
      fontFaceRules(manrope),
    );
    expect(text).to.match(
      /^@font-face \{\n {2}font-family: "Manrope";\n {2}font-style: normal;\n {2}font-weight: 200 800;\n {2}font-display: swap;\n {2}src: url\("\/branding\/fonts\/manrope-5\.3\.0-latin-ext-wght-normal\.woff2"\) format\("woff2"\);\n {2}unicode-range: U\+0100-02BA,/,
    );
    const parsed = parseStylesheet(text);
    expect(parsed.fontFaces).to.deep.equal(fontFaceRules(manrope));
    expect(parsed.variables?.shared).to.deep.equal({
      "--font-sans": '"Manrope", sans-serif',
    });
  });
});

function downloadsAndReusesFonts(): void {
  it("downloads the font a variable names into the layer and declares it", async () => {
    const saved = expectOk(
      await SetTheme(
        draft({ variables: withFont('"Inter", ui-sans-serif, sans-serif') }),
      ),
      "SetTheme",
    );
    expect(brandingFiles(FONT_FILES)).to.deep.equal(INTER_FILES);
    expect(requestedUrls).to.include(
      "https://cdn.jsdelivr.net/npm/@fontsource-variable/inter@5.3.0/files/inter-latin-wght-normal.woff2",
    );
    const stylesheet = readLayerFile(STYLESHEET);
    expect(stylesheet.match(/@font-face/g)).to.have.length(4);
    expect(stylesheet).to.contain(
      'src: url("/branding/fonts/inter-5.3.0-latin-wght-italic.woff2") format("woff2");',
    );
    const theme = expectOk(await GetTheme(), "GetTheme");
    expect(theme.version).to.equal(saved.version);
    expect(theme.variables.shared).to.deep.equal({
      "--font-sans": '"Inter", ui-sans-serif, sans-serif',
    });
  });

  it("saves again without the network once the font is in the layer", async () => {
    const variables = withFont('"Inter", sans-serif');
    expectOk(await SetTheme(draft({ variables })), "SetTheme");
    serveFonts(() => {
      throw new TypeError("fetch failed");
    });
    expectOk(
      await SetTheme(
        draft({ variables: { ...variables, dark: { "--ui-bg": "#000" } } }),
      ),
      "SetTheme",
    );
    expect(requestedUrls).to.deep.equal([]);
  });

  it("removes the files of a font no longer used, and leaves the author's own", async () => {
    writeLayerFile(`${FONT_FILES}/brand.woff2`, "the author's");
    expectOk(
      await SetTheme(draft({ variables: withFont('"Inter", sans-serif') })),
      "SetTheme",
    );
    expectOk(
      await SetTheme(draft({ variables: withFont('"Manrope", sans-serif') })),
      "SetTheme",
    );
    expect(brandingFiles(FONT_FILES)).to.deep.equal([
      "brand.woff2",
      "manrope-5.3.0-OFL.txt",
      "manrope-5.3.0-latin-ext-wght-normal.woff2",
      "manrope-5.3.0-latin-wght-normal.woff2",
    ]);
    expectOk(
      await SetTheme(draft({ variables: withFont(undefined) })),
      "SetTheme",
    );
    expect(brandingFiles(FONT_FILES)).to.deep.equal(["brand.woff2"]);
    expect(readLayerFile(STYLESHEET)).not.to.contain("@font-face");
  });
}

function refusesFailedOrForeignFonts(): void {
  it("writes nothing when a file cannot be downloaded, and says which", async () => {
    serveFonts((url) =>
      url.endsWith("latin-wght-italic.woff2")
        ? new Response("", { status: 503 })
        : new Response(new Uint8Array(WOFF2)),
    );
    const result = await SetTheme(
      draft({ variables: withFont('"Inter", sans-serif') }),
    );
    expect(!result.ok && result.error.code).to.equal("unsupported");
    expect(
      !result.ok && "detail" in result.error && result.error.detail,
    ).to.contain(
      "Inter: inter-latin-wght-italic.woff2 could not be downloaded from cdn.jsdelivr.net (HTTP 503)",
    );
    expect(brandingFiles(FONT_FILES)).to.deep.equal([]);
    expect(fs.existsSync(layerPath(STYLESHEET))).to.equal(false);
  });

  it("answers stale when the app config changes while a font downloads, and keeps that change", async () => {
    const edited = `export default defineDmsAppConfig({ ui: { colors: { primary: "teal" } } });\n`;
    serveFonts((url) => {
      writeLayerFile("app/app.config.ts", edited);
      return new Response(
        url.endsWith("/LICENSE") ? LICENSE : new Uint8Array(WOFF2),
      );
    });
    const theme = expectOk(await GetTheme(), "GetTheme");
    const result = await SetTheme(
      draft({ variables: withFont('"Inter", sans-serif') }),
      { expectedVersion: theme.version },
    );
    expect(!result.ok && result.error.code).to.equal("stale");
    expect(readLayerFile("app/app.config.ts")).to.equal(edited);
    expect(fs.existsSync(layerPath(STYLESHEET))).to.equal(false);
  });

  it("refuses a download that is not a font, or a license that is not the OFL", async () => {
    serveFonts(() => new Response("<html>not found</html>"));
    const notAFont = await SetTheme(
      draft({ variables: withFont('"Inter", sans-serif') }),
    );
    expect(
      !notAFont.ok && "detail" in notAFont.error && notAFont.error.detail,
    ).to.contain("is not a WOFF2 font");
    serveFonts(
      (url) =>
        new Response(
          url.endsWith("/LICENSE")
            ? "All rights reserved"
            : new Uint8Array(WOFF2),
        ),
    );
    const notTheOfl = await SetTheme(
      draft({ variables: withFont('"Inter", sans-serif') }),
    );
    expect(
      !notTheOfl.ok && "detail" in notTheOfl.error && notTheOfl.error.detail,
    ).to.contain("is not the SIL Open Font License");
    expect(brandingFiles(FONT_FILES)).to.deep.equal([]);
  });

  it("will not rewrite a stylesheet holding an @font-face of the author's", async () => {
    writeLayerFile(
      STYLESHEET,
      '@font-face {\n  font-family: "Brand";\n  src: url("/brand.woff2") format("woff2");\n}\n',
    );
    const result = await GetTheme();
    expect(
      !result.ok && "detail" in result.error && result.error.detail,
    ).to.contain("it holds an @font-face the builder did not write");
  });
}

describe("theme fonts, saved", function () {
  this.timeout(OP_TIMEOUT);

  beforeEach(() => {
    createThemeFixture();
    serveFonts();
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    destroyFixture();
  });

  downloadsAndReusesFonts();
  refusesFailedOrForeignFonts();
});
