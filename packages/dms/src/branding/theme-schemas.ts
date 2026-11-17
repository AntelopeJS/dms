import { z } from "zod";

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

/** A theme as `SetTheme` takes it: the whole of it, with the logo files sent along. */
export const themeDraftSchema = z.object({
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
});

/** The body of `PUT /api/branding/theme`. */
export const saveThemeBodySchema = z.object({
  draft: themeDraftSchema,
  expectedVersion: z.string().optional(),
});
