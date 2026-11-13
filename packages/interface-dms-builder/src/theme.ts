import { InterfaceFunction } from "@antelopejs/interface-core";
import type { MutationOpts, OpResult } from "./results";

/** The two color modes a theme value can be set for. */
export type ThemeMode = "light" | "dark";

/** CSS custom properties by name: `{ "--ui-bg": "#fafafa" }`. */
export type ThemeVariables = Record<string, string>;

/**
 * The CSS custom properties a theme overrides: those both modes share, and
 * those set for one mode only.
 *
 * A variable left out keeps the DMS default, so a theme only holds what it
 * changes. A shared value, such as the font or the corner radius, applies to
 * both modes unless a mode sets its own.
 */
export interface ThemeVariableSets {
  shared: ThemeVariables;
  light: ThemeVariables;
  dark: ThemeVariables;
}

/** The Nuxt UI color roles a theme picks a palette for. */
export type ThemeColorRole =
  | "primary"
  | "success"
  | "warning"
  | "error"
  | "info";

/**
 * The palette each role takes, by name: a Tailwind palette (`violet`), or one
 * the project's stylesheets declare (`brand` for `--color-brand-50…950`). A
 * role left out keeps the DMS palette.
 */
export type ThemeColors = Partial<Record<ThemeColorRole, string>>;

/** Where the dashboard shows a logo. */
export type LogoSlot = "default" | "collapsed" | "email" | "favicon";

/** Public paths, as the browser requests them: `/branding/logo.svg`. */
export type LogoPathsByMode = Partial<Record<ThemeMode, string>>;

/** A slot or a mode left out keeps the DMS logo. */
export type ThemeLogos = Partial<Record<LogoSlot, LogoPathsByMode>>;

/** A logo file sent with a save, for one slot in one color mode. */
export interface LogoUpload {
  slot: LogoSlot;
  mode: ThemeMode;
  /**
   * `image/svg+xml`, `image/png`, `image/jpeg`, `image/webp`, or
   * `image/x-icon` (also as `image/vnd.microsoft.icon`). The `email` slot
   * takes `image/png` or `image/jpeg` only, the formats every mail client
   * shows.
   */
  contentType: string;
  base64Content: string;
}

/** The project's frontend layer a theme is read from and written to. */
export interface ThemeLayer {
  name: string;
  /** Absolute path of the layer's source directory. */
  sourcePath: string;
}

/**
 * The files a theme lives in, relative to the layer's source directory. All
 * but the entry are under the directory the DMS frontend loader reads them
 * from: the layer itself, or the last of its `layers/` by name when it has
 * that directory.
 */
export interface ThemeFiles {
  /** The unlayered stylesheet holding the variables. */
  stylesheetPath: string;
  /** The app config holding `ui.colors` and `branding.logo`. */
  appConfigPath: string;
  /** The layer's entry, which imports the stylesheet. */
  entryPath: string;
  /**
   * Where uploaded logos are written, under the theme's `public/`, and the
   * files of the fonts it hosts, in its `fonts/`.
   */
  assetsDirectory: string;
}

/** A project's theme as its files hold it. */
export interface ThemeStructure {
  layer: ThemeLayer;
  variables: ThemeVariableSets;
  colors: ThemeColors;
  logos: ThemeLogos;
  files: ThemeFiles;
  /**
   * Whether the layer's entry already imports the stylesheet. If not, the
   * first save adds the import, and the development server then reloads the
   * whole page.
   */
  stylesheetImported: boolean;
  /**
   * Hash of the stylesheet, app config and entry (not the logo files) → pass
   * back as `expectedVersion`.
   */
  version: string;
}

/**
 * A theme as it should be written: the whole of it, replacing the one on disk.
 *
 * An upload replaces whatever `logos` says for its slot and mode, since the
 * server names the file after a hash of its (sanitized) content.
 */
export interface ThemeDraft {
  variables: ThemeVariableSets;
  colors: ThemeColors;
  logos: ThemeLogos;
  uploads?: LogoUpload[];
}

/**
 * The project's theme, read from its frontend layer.
 *
 * The layer is the highest-priority frontend module registered from inside the
 * project root, unless the module config names one. Fails with:
 * - `not_found` when the project has no layer, its `ref` naming where
 *   `CreateThemeLayer` would create it; or when the layer's entry file is
 *   missing, its `ref` naming that file (`CreateThemeLayer` does not fix it);
 * - `unsupported` when the stylesheet holds rules the builder does not write,
 *   or when the layer has a `layers/` directory with no layer in it.
 */
export const GetTheme =
  InterfaceFunction<() => Promise<OpResult<ThemeStructure>>>();

/**
 * Write a theme: its stylesheet, `ui.colors` and the logo paths of its app
 * config, the logo files, and the entry's import of the stylesheet when it
 * lacks one. One transaction: every file is checked before any is written.
 *
 * A variable whose value starts with a font the builder hosts
 * (`--font-sans: "Inter", sans-serif`) gets that font's files, downloaded
 * once from Fontsource, and its `@font-face` rules in the stylesheet; one the
 * theme no longer uses is deleted. A download that fails is refused with
 * `unsupported`, nothing written.
 *
 * SVG logos are written sanitized; the save warns (`svg_sanitized`) when that
 * removed anything that runs or fetches. A palette or a logo path the
 * builder cannot rewrite (anything but a string literal, or any key of an
 * object with a spread) is kept as written; a draft that changes one is
 * refused with `unsupported`, naming its key path. A draft not shaped like
 * `ThemeDraft` is refused with `invalid_config`.
 */
export const SetTheme =
  InterfaceFunction<
    (
      draft: ThemeDraft,
      opts?: MutationOpts,
    ) => Promise<OpResult<{ version: string }>>
  >();

/**
 * Create the frontend layer a theme is written to, for a project without one:
 * `frontend-vue/` at the project root, with an entry importing the stylesheet,
 * registered from the project's `start()` above the DMS. A project that
 * already has a layer gets it back unchanged, and nothing is written.
 *
 * The backend reloads with the registration; the frontend dev server reads
 * its frontend modules at startup, so it needs a restart to serve the layer.
 */
export const CreateThemeLayer =
  InterfaceFunction<() => Promise<OpResult<ThemeLayer>>>();
