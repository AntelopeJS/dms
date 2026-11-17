import {
  CreateThemeLayer,
  GetTheme,
  SetTheme,
} from "@antelopejs/interface-dms-builder";
import { z } from "zod";
import { themeDraftSchema } from "../../branding";
import { defineTool } from "../tool";
import { withEscalationNote, opResult } from "./builder-shared";

const getTheme = defineTool({
  name: "builder_get_theme",
  title: "Get theme",
  description: withEscalationNote(
    "Reads the project's theme back from its frontend layer: the CSS custom properties it overrides (`variables.shared`, `.light`, `.dark`), the palette of each Nuxt UI color role (`colors`: primary, success, warning, error, info), the public path of each logo slot per mode (`logos`: default, collapsed, email, favicon), the files they live in, whether the layer's entry imports the stylesheet, and a `version` to pass back as builder_set_theme's `expectedVersion`. Only string literals are read back: a palette or logo path the app config holds as code reads as no override. A project without a layer of its own answers `not_found`, its `ref` naming where builder_create_theme_layer would create it; a stylesheet holding rules the builder does not write answers `unsupported`.",
  ),
  effect: "read",
  input: z.object({}),
  run: async () => opResult(await GetTheme()),
});

const setTheme = defineTool({
  name: "builder_set_theme",
  title: "Set theme",
  description: withEscalationNote(
    'Writes the whole theme in one transaction, replacing the one on disk: what the draft leaves out goes back to the DMS default, so start from builder_get_theme and change only what you mean to. `variables` holds custom properties, `colors` a palette per role, `logos` public paths per slot and mode. An upload sets its slot and mode over `logos`; its file is named after its content, so a new logo is a new URL. SVG is written sanitized, with an `svg_sanitized` warning when anything that runs or fetches was taken out; one that is not a single well-formed `<svg>` is refused with `invalid_config`. A variable whose value starts with a hosted font (`--font-sans: "Inter", sans-serif`; Inter, IBM Plex Sans, Public Sans, DM Sans, Manrope, Plus Jakarta Sans, Figtree, Atkinson Hyperlegible Next, Nunito, Source Serif 4) gets its files downloaded once into the layer; a download that fails writes nothing. A palette or logo path the app config holds as code stays as written when the draft leaves it as read; a draft that changes one is refused with `unsupported`, naming its key path. Pass `expectedVersion` from builder_get_theme: `stale` comes back when the files changed since. The first save that writes a stylesheet adds its import to the layer\'s entry, which reloads the page in development.',
  ),
  effect: "builder",
  input: themeDraftSchema.extend({
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
  description: withEscalationNote(
    "Creates the frontend layer a theme is written to, for a project without one (builder_get_theme answers `not_found`): `frontend-vue/` at the project root, with a `package.json` and an entry importing the stylesheet, registered from the project's `start()` above the DMS. A project that already has a layer gets it back unchanged, and nothing is written. The backend reloads with the registration; the frontend dev server serves the layer once restarted.",
  ),
  effect: "builder",
  input: z.object({}),
  run: async () => opResult(await CreateThemeLayer()),
});

export const BUILDER_THEME_TOOLS = [getTheme, setTheme, createThemeLayer];
