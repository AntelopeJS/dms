import {
  CreateThemeLayer,
  GetTheme,
  SetTheme,
} from "@antelopejs/interface-dms-builder";
import { z } from "zod";
import { defineTool } from "../tool";
import { note, opResult } from "./builder-shared";

const VARIABLES = z
  .record(z.string(), z.string())
  .describe(
    'CSS custom properties by name, e.g. `{ "--ui-radius": "0.5rem" }`. A value must not end its declaration (`;`, braces, comments, `url()`, `@import`, `!important`) nor leave a parenthesis, bracket or quote open.',
  );

const PALETTE = z
  .string()
  .optional()
  .describe(
    "A palette name: a Tailwind palette (`violet`), or one the project's stylesheets declare (`brand` for `--color-brand-50…950`). Left out, the role keeps the DMS palette.",
  );

const LOGO_PATHS = z
  .object({ light: z.string().optional(), dark: z.string().optional() })
  .optional()
  .describe(
    "Public paths per mode, rooted in `public/` as the browser requests them (`/branding/logo.svg`), never `//host/…`. A mode left out keeps the DMS logo.",
  );

const LOGO_UPLOAD = z.object({
  slot: z.enum(["default", "collapsed", "email", "favicon"]),
  mode: z.enum(["light", "dark"]),
  contentType: z
    .string()
    .describe(
      "`image/svg+xml`, `image/png`, `image/jpeg`, `image/webp` or `image/x-icon`. The `email` slot takes `image/png` or `image/jpeg` only.",
    ),
  base64Content: z
    .string()
    .describe("The file's bytes in base64, up to 512 KiB decoded."),
});

const getTheme = defineTool({
  name: "builder_get_theme",
  title: "Get theme",
  description: note(
    "Reads the project's theme back from its frontend layer: the CSS custom properties it overrides (`variables.shared`, `.light`, `.dark`), the palette of each Nuxt UI color role (`colors`: primary, success, warning, error, info), the public path of each logo slot per mode (`logos`: default, collapsed, email, favicon), the files they live in, whether the layer's entry imports the stylesheet, and a `version` to pass back as builder_set_theme's `expectedVersion`. Only string literals are read back: a palette or logo path the app config holds as code reads as no override. A project without a layer of its own answers `not_found`, its `ref` naming where builder_create_theme_layer would create it; a stylesheet holding rules the builder does not write answers `unsupported`.",
  ),
  effect: "read",
  input: z.object({}),
  run: async () => opResult(await GetTheme()),
});

const setTheme = defineTool({
  name: "builder_set_theme",
  title: "Set theme",
  description: note(
    'Writes the whole theme in one transaction, replacing the one on disk: what the draft leaves out goes back to the DMS default, so start from builder_get_theme and change only what you mean to. `variables` holds custom properties, `colors` a palette per role, `logos` public paths per slot and mode. An upload sets its slot and mode over `logos`; its file is named after its content, so a new logo is a new URL. SVG is written sanitized, with an `svg_sanitized` warning when anything that runs or fetches was taken out; one that is not a single well-formed `<svg>` is refused with `invalid_config`. A variable whose value starts with a hosted font (`--font-sans: "Inter", sans-serif`; Inter, IBM Plex Sans, Public Sans, DM Sans, Manrope, Plus Jakarta Sans, Figtree, Atkinson Hyperlegible Next, Nunito, Source Serif 4) gets its files downloaded once into the layer; a download that fails writes nothing. A palette or logo path the app config holds as code stays as written when the draft leaves it as read; a draft that changes one is refused with `unsupported`, naming its key path. Pass `expectedVersion` from builder_get_theme: `stale` comes back when the files changed since. The first save that writes a stylesheet adds its import to the layer\'s entry, which reloads the page in development.',
  ),
  effect: "builder",
  input: z.object({
    variables: z
      .object({ shared: VARIABLES, light: VARIABLES, dark: VARIABLES })
      .describe(
        "The variables both modes share, then those set for light or dark only. A variable left out keeps the DMS default.",
      ),
    colors: z.object({
      primary: PALETTE,
      success: PALETTE,
      warning: PALETTE,
      error: PALETTE,
      info: PALETTE,
    }),
    logos: z.object({
      default: LOGO_PATHS,
      collapsed: LOGO_PATHS,
      email: LOGO_PATHS,
      favicon: LOGO_PATHS,
    }),
    uploads: z
      .array(LOGO_UPLOAD)
      .optional()
      .describe(
        "Logo files sent with the save, each for one slot in one mode. Of two for one slot and mode, only the last is written.",
      ),
    expectedVersion: z
      .string()
      .optional()
      .describe("The `version` builder_get_theme answered."),
  }),
  run: async ({ expectedVersion, ...draft }) =>
    opResult(
      await SetTheme(
        draft,
        expectedVersion === undefined ? undefined : { expectedVersion },
      ),
    ),
});

const createThemeLayer = defineTool({
  name: "builder_create_theme_layer",
  title: "Create theme layer",
  description: note(
    "Creates the frontend layer a theme is written to, for a project without one (builder_get_theme answers `not_found`): `frontend-vue/` at the project root, with a `package.json` and an entry importing the stylesheet, registered from the project's `start()` above the DMS. A project that already has a layer gets it back unchanged, and nothing is written. The backend reloads with the registration; the frontend dev server serves the layer once restarted.",
  ),
  effect: "builder",
  input: z.object({}),
  run: async () => opResult(await CreateThemeLayer()),
});

/** The builder tools that read and write the project's theme and create the layer it lives in. */
export const BUILDER_THEME_TOOLS = [getTheme, setTheme, createThemeLayer];
