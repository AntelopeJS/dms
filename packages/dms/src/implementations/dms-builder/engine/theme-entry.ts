import type { SourceFile } from "ts-morph";

/** The layer's entry, the one file every frontend module has. */
export const ENTRY_FILE = "dms.frontend.ts";

/** The theme's stylesheet, relative to the theme's root in the layer. */
export const STYLESHEET_FILE = "app/assets/css/theme.css";

/** `stylesheetPath` is relative to the layer. */
function stylesheetSpecifier(stylesheetPath: string): string {
  return `./${stylesheetPath}`;
}

/**
 * Source of the entry the builder scaffolds: it registers nothing and imports
 * the stylesheet, as the theming guide shows. The app config needs no import:
 * the loader applies every layer's `app/app.config.ts` itself.
 */
export function scaffoldEntrySource(stylesheetPath: string): string {
  return `import "${stylesheetSpecifier(stylesheetPath)}";
import type { DmsFrontendModule } from "#dms/frontend-module";

/**
 * The project's frontend layer, loaded above the DMS. It holds the theme (the
 * stylesheet imported above, app/app.config.ts and public/) and can register
 * the project's own pages and components.
 */
const projectFrontend: DmsFrontendModule = {
  setup() {},
};

export default projectFrontend;
`;
}

export function importsStylesheet(
  entry: SourceFile,
  stylesheetPath: string,
): boolean {
  const specifier = stylesheetSpecifier(stylesheetPath);
  return entry
    .getImportDeclarations()
    .some((declaration) => declaration.getModuleSpecifierValue() === specifier);
}

/**
 * Adds the import after the existing ones, if missing. A stylesheet reaches
 * the dashboard only through a module that imports it: the loader finds
 * `public/` and the app config on its own, but not stylesheets.
 */
export function importStylesheet(
  entry: SourceFile,
  stylesheetPath: string,
): void {
  if (!importsStylesheet(entry, stylesheetPath)) {
    entry.addImportDeclaration({
      moduleSpecifier: stylesheetSpecifier(stylesheetPath),
    });
  }
}
