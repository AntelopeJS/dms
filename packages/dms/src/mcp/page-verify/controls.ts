import type { BrowserContext, Locator, Page, Route } from "./playwright";

/** The region every dashboard layout draws the page in. */
export const CONTENT = "[data-dms-page-content]";
const SAFE_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS"]);
/** Writes a page makes to stay signed in and live, which change no data. */
const HARMLESS_WRITES = [/\/api\/realtime\//, /\/api\/_auth\//];
export const REACTION_TIMEOUT_MS = 3_000;
export const CLICK_TIMEOUT_MS = 5_000;
export const NAME_CHARS = 80;

/** Whether the page's writes go through, and the writes it tried. */
export interface WriteGuard {
  submit: boolean;
  /** Each write the page tried, as `METHOD /path`, whether held back or let through. */
  writes: string[];
}

/**
 * Holds back every write the page tries (anything but GET, HEAD or OPTIONS,
 * realtime subscriptions aside) unless the caller asked forms to submit, so
 * clicking around a page can change no data.
 */
export async function guardWrites(
  context: BrowserContext,
  guard: WriteGuard,
): Promise<void> {
  await context.route("**/*", async (route: Route) => {
    const request = route.request();
    const harmless =
      SAFE_METHODS.has(request.method()) ||
      HARMLESS_WRITES.some((pattern) => pattern.test(request.url()));
    if (harmless) return route.continue();
    guard.writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
    return guard.submit ? route.continue() : route.abort("blockedbyclient");
  });
}

/** How a person names a control: its ARIA label, else its text. */
export async function nameOf(control: Locator): Promise<string> {
  const label = await control.getAttribute("aria-label").catch(() => null);
  const text = label ?? (await control.innerText().catch(() => ""));
  return text.replace(/\s+/g, " ").trim().slice(0, NAME_CHARS);
}

/** The first visible candidate, and when `named` is given the first whose name matches it. */
export async function firstVisible(
  candidates: Locator,
  named?: RegExp,
): Promise<Locator | undefined> {
  const count = await candidates.count();
  for (let index = 0; index < count; index += 1) {
    const candidate = candidates.nth(index);
    if (!(await candidate.isVisible().catch(() => false))) continue;
    if (named === undefined || named.test(await nameOf(candidate)))
      return candidate;
  }
  return undefined;
}

/** The text the page content shows, to tell whether an action changed it. */
export async function contentText(page: Page): Promise<string> {
  return page
    .locator(CONTENT)
    .first()
    .innerText({ timeout: 1_000 })
    .catch(() => "");
}
