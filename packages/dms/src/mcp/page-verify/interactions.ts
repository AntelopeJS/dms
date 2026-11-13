import {
  CLICK_TIMEOUT_MS,
  CONTENT,
  contentText,
  NAME_CHARS,
  nameOf,
  REACTION_TIMEOUT_MS,
  type WriteGuard,
} from "./controls";
import { checkForms } from "./forms";
import type { Locator, Page } from "./playwright";
import type { Interaction } from "./report";
import { probePage } from "./page-probe";
import { openPage } from "./render";

const MAX_LINKS = 8;
const MAX_TABS = 6;
const MAX_SORTS = 2;
const MAX_FILTERS = 2;
const TAB_SETTLE_MS = 500;
const FILTER_PROBE = "zzpageverify";
const HTTP_ERROR_STATUS = 400;

/**
 * Counts the requests the page sends while `act` runs and shortly after: a
 * control that refetches its data answers this way.
 */
async function requestsDuring(
  page: Page,
  act: () => Promise<void>,
): Promise<number> {
  let count = 0;
  const listener = (): void => {
    count += 1;
  };
  page.on("request", listener);
  try {
    await act();
    await page.waitForTimeout(REACTION_TIMEOUT_MS);
  } finally {
    page.off("request", listener);
  }
  return count;
}

async function checkLinks(page: Page, origin: string): Promise<Interaction[]> {
  const links = await page
    .locator(`${CONTENT} a[href]`)
    .evaluateAll((anchors) =>
      anchors.map((anchor) => ({
        href: anchor instanceof HTMLAnchorElement ? anchor.href : "",
        name: (
          anchor.getAttribute("aria-label") ??
          anchor.textContent ??
          ""
        ).trim(),
      })),
    );
  const current = page.url().split("#")[0];
  const seen = new Set<string>();
  const targets = links.filter((link) => {
    const href = link.href.split("#")[0] ?? "";
    if (!href.startsWith(origin) || href === current || seen.has(href))
      return false;
    seen.add(href);
    return true;
  });
  const results: Interaction[] = [];
  for (const link of targets.slice(0, MAX_LINKS)) {
    const response = await page.context().request.get(link.href);
    results.push({
      kind: "link",
      target: `link "${link.name.slice(0, NAME_CHARS)}" → ${new URL(link.href).pathname}`,
      ok: response.status() < HTTP_ERROR_STATUS,
      detail: `answered ${response.status()}`,
    });
  }
  return results;
}

async function becomesSelected(tab: Locator): Promise<boolean> {
  const deadline = Date.now() + REACTION_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if ((await tab.getAttribute("aria-selected")) === "true") return true;
    await tab.page().waitForTimeout(100);
  }
  return false;
}

/**
 * Selects each tab of the page. The blocks a tab holds mount only once it
 * is selected, so each selection adds the blocks it drew to `revealed`.
 */
async function checkTabs(
  page: Page,
  revealed: Set<string>,
): Promise<Interaction[]> {
  const tabs = page.locator(`${CONTENT} [role=tab]`);
  const count = Math.min(await tabs.count(), MAX_TABS);
  const results: Interaction[] = [];
  for (let index = 0; index < count; index += 1) {
    const tab = tabs.nth(index);
    if ((await tab.getAttribute("aria-selected")) === "true") continue;
    const name = await nameOf(tab);
    await tab.click({ timeout: CLICK_TIMEOUT_MS }).catch(() => undefined);
    const ok = await becomesSelected(tab);
    if (ok) {
      await page.waitForTimeout(TAB_SETTLE_MS);
      for (const block of (await probePage(page)).blocks)
        revealed.add(block.path);
    }
    results.push({
      kind: "tab",
      target: `tab "${name}"`,
      ok,
      detail: ok ? "selected on click" : "stayed unselected after a click",
    });
  }
  return results;
}

async function firstRowText(page: Page): Promise<string> {
  return page
    .locator(`${CONTENT} tbody tr`)
    .first()
    .innerText({ timeout: 1_000 })
    .catch(() => "");
}

async function sortOnce(page: Page, header: Locator): Promise<boolean> {
  const before = await header.getAttribute("aria-sort");
  const rowBefore = await firstRowText(page);
  const requests = await requestsDuring(page, async () => {
    await header.locator("button").first().click({ timeout: CLICK_TIMEOUT_MS });
    const item = page.getByRole("menuitem").first();
    if (await item.isVisible().catch(() => false)) await item.click();
  });
  const after = await header.getAttribute("aria-sort");
  return (
    before !== after || requests > 0 || rowBefore !== (await firstRowText(page))
  );
}

async function checkSorts(page: Page): Promise<Interaction[]> {
  const headers = page.locator(`${CONTENT} th[aria-sort]`);
  const count = Math.min(await headers.count(), MAX_SORTS);
  const results: Interaction[] = [];
  for (let index = 0; index < count; index += 1) {
    const header = headers.nth(index);
    const name = await nameOf(header);
    const ok = await sortOnce(page, header).catch(() => false);
    await page.keyboard.press("Escape");
    results.push({
      kind: "sort",
      target: `column "${name}"`,
      ok,
      detail: ok
        ? "the table reordered or refetched"
        : "nothing changed after sorting",
    });
  }
  return results;
}

const SEARCH_INPUTS = [
  "input[type=search]",
  "[role=searchbox]",
  'input[placeholder*="search" i]',
]
  .map((selector) => `${CONTENT} ${selector}`)
  .join(", ");

/** The visible search fields, after opening those a button hides. */
async function searchInputs(page: Page): Promise<Locator> {
  const inputs = page.locator(SEARCH_INPUTS);
  if ((await inputs.count()) > 0) return inputs;
  const openers = page.locator(`${CONTENT} button[aria-label*="search" i]`);
  const count = Math.min(await openers.count(), MAX_FILTERS);
  for (let index = 0; index < count; index += 1) {
    await openers
      .nth(index)
      .click({ timeout: CLICK_TIMEOUT_MS })
      .catch(() => undefined);
  }
  return inputs;
}

async function checkFilters(page: Page): Promise<Interaction[]> {
  const inputs = await searchInputs(page);
  const count = Math.min(await inputs.count(), MAX_FILTERS);
  const results: Interaction[] = [];
  for (let index = 0; index < count; index += 1) {
    const input = inputs.nth(index);
    const name =
      (await input.getAttribute("placeholder")) ?? (await nameOf(input));
    const before = await contentText(page);
    const requests = await requestsDuring(page, () => input.fill(FILTER_PROBE));
    const ok = requests > 0 || before !== (await contentText(page));
    await input.fill("").catch(() => undefined);
    results.push({
      kind: "filter",
      target: `search "${name}"`,
      ok,
      detail: ok
        ? "the results refetched or changed"
        : "nothing changed after typing",
    });
  }
  return results;
}

/** What clicking through a page found. */
export interface InteractionOutcome {
  interactions: Interaction[];
  /** Layout paths of the blocks drawn once their tab was selected. */
  revealed: ReadonlySet<string>;
}

/**
 * Clicks through the page as a person would, with writes held back unless
 * `guard.submit`: links answer, tabs select, sorting and searching refetch
 * or reorder, forms open and show validation on an empty submit.
 */
export async function checkInteractions(
  page: Page,
  url: string,
  origin: string,
  guard: WriteGuard,
): Promise<InteractionOutcome> {
  await openPage(page, url);
  const revealed = new Set<string>();
  const results = [
    ...(await checkLinks(page, origin)),
    ...(await checkTabs(page, revealed)),
    ...(await checkSorts(page)),
    ...(await checkFilters(page)),
  ];
  await openPage(page, url);
  return {
    interactions: [...results, ...(await checkForms(page, url, guard))],
    revealed,
  };
}
