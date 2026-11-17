import fs from "node:fs";
import path from "node:path";
import type { LogoUpload, ThemeDraft } from "@antelopejs/interface-dms-builder";
import { setBuilderConfig } from "../../../../config";
import { createFixture, type Fixture } from "../harness";

/** The layer the theme suites write to, relative to the fixture's root. */
export const LAYER = "frontend-vue";
export const OP_TIMEOUT = 30_000;

export const ENTRY_SOURCE = `import type { DmsFrontendModule } from "#dms/frontend-module";

const projectFrontend: DmsFrontendModule = {
  setup(sdk) {
    sdk.registerComponent("Hello", {});
  },
};

export default projectFrontend;
`;

export const APP_CONFIG_SOURCE = `export default defineDmsAppConfig({
  ui: {
    colors: { primary: "violet" },
    button: { slots: { base: "font-bold" } },
  },
});
`;

export const SVG_LOGO =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8"/></svg>';
export const PNG_LOGO = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13,
]);
export const JPEG_LOGO = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46,
]);

let root = "";

/**
 * Point the engine at an empty app, as `createFixture` does, and — unless
 * told not to — give it the layer the theme is configured to live in, with
 * an entry and `appConfig` as its app config.
 */
export function createThemeFixture(
  options: { withLayer?: boolean; appConfig?: string } = {},
): Fixture {
  const app = createFixture();
  root = app.root;
  if (options.withLayer !== false) {
    setBuilderConfig({ projectRoot: app.root, theme: { layerPath: LAYER } });
    writeLayerFile("dms.frontend.ts", ENTRY_SOURCE);
    writeLayerFile("app/app.config.ts", options.appConfig ?? APP_CONFIG_SOURCE);
  }
  return app;
}

/** A path inside the layer of the fixture last created. */
export function layerPath(relative: string): string {
  return path.join(root, LAYER, relative);
}

export function writeLayerFile(relative: string, content: string): void {
  fs.mkdirSync(path.dirname(layerPath(relative)), { recursive: true });
  fs.writeFileSync(layerPath(relative), content);
}

export function readLayerFile(relative: string): string {
  return fs.readFileSync(layerPath(relative), "utf8");
}

/** The files of the layer's `public/branding`, or none when it is absent. */
export function brandingFiles(relative = "public/branding"): string[] {
  return fs.existsSync(layerPath(relative))
    ? fs.readdirSync(layerPath(relative)).sort()
    : [];
}

export function upload(
  slot: LogoUpload["slot"],
  mode: LogoUpload["mode"],
  content: string | Buffer,
  contentType: string,
): LogoUpload {
  return {
    slot,
    mode,
    contentType,
    base64Content: Buffer.from(content).toString("base64"),
  };
}

export function draft(overrides: Partial<ThemeDraft> = {}): ThemeDraft {
  return {
    variables: {
      shared: {},
      light: { "--ui-bg": "#fafafa" },
      dark: { "--ui-bg": "#111111" },
    },
    colors: { primary: "violet" },
    logos: {},
    ...overrides,
  };
}

/** A draft with no variables: a save of it writes the app config alone. */
export function configDraft(overrides: Partial<ThemeDraft> = {}): ThemeDraft {
  return draft({
    variables: { shared: {}, light: {}, dark: {} },
    ...overrides,
  });
}
