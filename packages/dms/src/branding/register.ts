import { registerBrandingPage } from "./page";
import { registerBrandingRoutes } from "./routes";

/**
 * Serves the Branding editor: the `/api/branding` routes and the `/branding`
 * page. Development only, with the builder: the routes write the project's
 * theme files through the builder's theme operations.
 */
export function registerBranding(): void {
  registerBrandingRoutes();
  registerBrandingPage();
}
