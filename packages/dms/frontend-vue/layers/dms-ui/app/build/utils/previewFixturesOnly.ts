/** The query `/dms-preview` reads to draw a mockup on its fixtures alone, and its value. */
export const FIXTURES_ONLY_QUERY = "fixtures";
export const FIXTURES_ONLY_VALUE = "only";

/** The routes answering a mockup's fixtures and its own state. */
const MOCKUP_ROUTES = "/api/mockup/";

/**
 * What the dashboard reads on any page, none of it a block's data: its
 * realtime session and page topics, its icons, and the system and onboarding
 * state its shell checks.
 */
const SHELL_ROUTES = [
  "/api/realtime/",
  "/api/_dms/",
  "/api/system-state",
  "/api/onboarding/informations",
];

/** Where the dashboard's own scripts, styles and images are served, built or in development. */
const ASSET_PATHS = [
  "/_nuxt/",
  "/frontend-modules/",
  "/node_modules/",
  "/@fs/",
  "/@id/",
];

/** The parts of the frame's location the policy is built from. */
export type PolicyLocation = Pick<Location, "origin" | "host" | "protocol">;

/**
 * The Content Security Policy of a preview drawn on fixtures: images, media
 * and connections reach the mockup's routes, the dashboard's own and its
 * assets only, so no value a block holds can make the frame read a live
 * route, whatever block or data type draws it.
 */
export function fixturesOnlyPolicy(location: PolicyLocation): string {
  const at = (paths: readonly string[]) =>
    paths.map((path) => `${location.origin}${path}`).join(" ");
  const socket = location.protocol === "https:" ? "wss:" : "ws:";
  return [
    `img-src data: blob: ${at([MOCKUP_ROUTES, ...ASSET_PATHS])}`,
    `media-src data: blob: ${at([MOCKUP_ROUTES])}`,
    `connect-src ${at([MOCKUP_ROUTES, ...SHELL_ROUTES])} ${socket}//${location.host}`,
    "frame-src 'none'",
    "object-src 'none'",
  ].join("; ");
}

/**
 * Puts {@link fixturesOnlyPolicy} on the document. The browser enforces it
 * on every request made after, and it lasts as long as the document: the
 * page that embeds the preview loads another document to read live routes.
 */
export function applyFixturesOnlyPolicy(
  document: Document,
  location: PolicyLocation,
): void {
  const meta = document.createElement("meta");
  meta.httpEquiv = "Content-Security-Policy";
  meta.content = fixturesOnlyPolicy(location);
  document.head.prepend(meta);
}
