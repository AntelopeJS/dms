import type { BrowserContext, Locator, Page, Route } from "./playwright";
import type { Interaction } from "./report";
import { openPage, waitSettled } from "./render";

const CONTENT = "[data-dms-page-content]";
const SAFE_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS"]);
/** Writes a page makes to stay signed in and live, which change no data. */
const HARMLESS_WRITES = [/\/api\/realtime\//, /\/api\/_auth\//];
const MAX_LINKS = 8;
const MAX_TABS = 6;
const MAX_SORTS = 2;
const MAX_FILTERS = 2;
const MAX_FORM_OPENERS = 4;
const MAX_INLINE_FORMS = 3;
const REACTION_TIMEOUT_MS = 3_000;
const CLICK_TIMEOUT_MS = 5_000;
const NAME_CHARS = 80;
const FILTER_PROBE = "zzpageverify";
const HTTP_ERROR_STATUS = 400;
const OPENER_NAME = /^\s*(new|add|create|edit)\b/i;
const SAMPLE_TEXT = "page_verify";
const SAMPLE_EMAIL = "page-verify@example.com";
const SAMPLE_NUMBER = "1";
const SAMPLE_URL = "https://example.com/";

/** The writes a run held back, and whether forms may submit. */
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

async function nameOf(control: Locator): Promise<string> {
  const label = await control.getAttribute("aria-label").catch(() => null);
  const text = label ?? (await control.innerText().catch(() => ""));
  return text.replace(/\s+/g, " ").trim().slice(0, NAME_CHARS);
}

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

async function checkTabs(page: Page): Promise<Interaction[]> {
  const tabs = page.locator(`${CONTENT} [role=tab]`);
  const count = Math.min(await tabs.count(), MAX_TABS);
  const results: Interaction[] = [];
  for (let index = 0; index < count; index += 1) {
    const tab = tabs.nth(index);
    if ((await tab.getAttribute("aria-selected")) === "true") continue;
    const name = await nameOf(tab);
    await tab.click({ timeout: CLICK_TIMEOUT_MS }).catch(() => undefined);
    const ok = await becomesSelected(tab);
    results.push({
      kind: "tab",
      target: `tab "${name}"`,
      ok,
      detail: ok ? "selected on click" : "stayed unselected after a click",
    });
  }
  return results;
}

async function contentText(page: Page): Promise<string> {
  return page
    .locator(CONTENT)
    .first()
    .innerText({ timeout: 1_000 })
    .catch(() => "");
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

const INVALID = '[aria-invalid="true"]';

async function invalidCount(form: Locator): Promise<number> {
  return form.locator(INVALID).count();
}

/**
 * Fills each field the form flagged invalid with a sample value its type
 * accepts. A filled field leaves the invalid set, so each round takes the
 * first one still in it.
 */
async function fillInvalid(form: Locator): Promise<void> {
  const fields = form.locator(`input${INVALID}, textarea${INVALID}`);
  const count = await fields.count();
  for (let round = 0; round < count; round += 1) {
    if ((await fields.count()) === 0) return;
    const field = fields.first();
    await field.fill(await sampleFor(field)).catch(() => undefined);
  }
}

/**
 * A value the field accepts, read from what it says it takes: its type,
 * input mode, name and placeholder, since a DMS email or URL field can be a
 * plain text input.
 */
async function sampleFor(field: Locator): Promise<string> {
  const hints = await Promise.all(
    ["type", "inputmode", "name", "placeholder", "aria-label"].map((name) =>
      field.getAttribute(name).catch(() => null),
    ),
  );
  const said = hints.join(" ").toLowerCase();
  if (said.includes("email")) return SAMPLE_EMAIL;
  if (said.includes("url")) return SAMPLE_URL;
  if (said.includes("number") || said.includes("numeric")) return SAMPLE_NUMBER;
  return SAMPLE_TEXT;
}

/** How a form answered being submitted. */
type FormOutcome = Pick<Interaction, "ok" | "detail">;

const EDITABLE =
  "input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly])";
const SUBMIT_NAME = /^\s*(save|create|submit|send|update)\b/i;

async function firstVisible(
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

/**
 * The control that submits the form: its own submit button, else a save
 * button of the page, such as a floating save bar drawn outside the form.
 */
async function submitControl(
  page: Page,
  form: Locator,
): Promise<Locator | undefined> {
  return (
    (await firstVisible(form.locator("[type=submit]"))) ??
    (await firstVisible(page.locator(`${CONTENT} button`), SUBMIT_NAME))
  );
}

async function enabledSubmit(
  page: Page,
  form: Locator,
): Promise<Locator | undefined> {
  const control = await submitControl(page, form);
  return control !== undefined && (await control.isEnabled().catch(() => false))
    ? control
    : undefined;
}

/** Changes the first text field of the form, as a person editing it does. */
async function changeAField(form: Locator): Promise<boolean> {
  const field = await firstVisible(form.locator(EDITABLE));
  if (field === undefined) return false;
  await field.fill(await sampleFor(field)).catch(() => undefined);
  return true;
}

async function clickAndWait(page: Page, control: Locator): Promise<void> {
  await control.click({ timeout: CLICK_TIMEOUT_MS }).catch(() => undefined);
  await page.waitForTimeout(REACTION_TIMEOUT_MS / 2);
}

function writeDetail(guard: WriteGuard, what: string): string {
  return guard.submit
    ? `${what}; the write went through (submit: true)`
    : `${what}; the write was held back (submit: false)`;
}

/** A form with no enabled submit control, even once a field changed: an auto-saving one writes on change. */
function withoutSubmit(
  changed: boolean,
  wrote: boolean,
  guard: WriteGuard,
): FormOutcome {
  if (wrote) return { ok: true, detail: writeDetail(guard, "saved on change") };
  return {
    ok: true,
    detail: changed
      ? "not checked: no submit control appeared and changing a text field saved nothing; the form may save from other controls"
      : "not checked: no enabled submit control and no text field to change",
  };
}

async function submitDetail(
  page: Page,
  form: Locator,
  guard: WriteGuard,
): Promise<FormOutcome> {
  const writesBefore = guard.writes.length;
  const wrote = (): boolean => guard.writes.length > writesBefore;
  let control = await enabledSubmit(page, form);
  let changed = false;
  if (control === undefined) {
    changed = await changeAField(form);
    await page.waitForTimeout(REACTION_TIMEOUT_MS / 2);
    control = await enabledSubmit(page, form);
  }
  if (control === undefined) return withoutSubmit(changed, wrote(), guard);
  const invalidBefore = await invalidCount(form);
  await clickAndWait(page, control);
  const validated = (await invalidCount(form)) > invalidBefore;
  if (guard.submit && validated) {
    await fillInvalid(form);
    await clickAndWait(page, control);
    const left = await invalidCount(form);
    return left === 0
      ? {
          ok: true,
          detail: writeDetail(
            guard,
            "validation shown; submitted with sample values",
          ),
        }
      : {
          ok: true,
          detail: `validation shown; ${left} fields refused the sample values, so nothing was submitted`,
        };
  }
  if (validated)
    return {
      ok: true,
      detail: changed
        ? "validation shown on submit"
        : "validation shown on an empty submit",
    };
  if (wrote())
    return {
      ok: true,
      detail: writeDetail(
        guard,
        changed
          ? "submitted after a field changed"
          : "no field is required: submitted empty",
      ),
    };
  return {
    ok: false,
    detail: "submit was clicked, but neither validation nor a write followed",
  };
}

async function trySubmit(
  page: Page,
  form: Locator,
  guard: WriteGuard,
): Promise<Interaction> {
  const title = await nameOf(page.locator("h1").last()).catch(() => "");
  return {
    kind: "form",
    target: `form "${title || "untitled"}"`,
    ...(await submitDetail(page, form, guard)),
  };
}

async function openers(page: Page): Promise<Locator[]> {
  const candidates = page.locator(
    `[data-dms-page-header-actions] button, ${CONTENT} button, ${CONTENT} a[role=button]`,
  );
  const found: Locator[] = [];
  const count = await candidates.count();
  for (
    let index = 0;
    index < count && found.length < MAX_FORM_OPENERS;
    index += 1
  ) {
    const candidate = candidates.nth(index);
    const opens =
      OPENER_NAME.test(await nameOf(candidate)) &&
      (await candidate.isVisible().catch(() => false));
    if (opens) found.push(candidate);
  }
  return found;
}

async function checkOpenedForm(
  page: Page,
  url: string,
  opener: Locator,
  guard: WriteGuard,
): Promise<Interaction> {
  const name = await nameOf(opener);
  await opener.click({ timeout: CLICK_TIMEOUT_MS });
  await waitSettled(page);
  const form = page.locator("[role=dialog] form, form").first();
  const opened = await form.isVisible().catch(() => false);
  if (!opened) {
    return {
      kind: "form",
      target: `button "${name}"`,
      ok: false,
      detail: "no form opened on click",
    };
  }
  const submitted = await trySubmit(page, form, guard);
  await openPage(page, url);
  return { ...submitted, target: `${submitted.target} opened by "${name}"` };
}

/**
 * How many of the page's forms to check, first ones first: those holding
 * their own submit control, else the first form alone, which a page-level
 * save bar submits.
 */
async function inlineForms(page: Page): Promise<number[]> {
  const forms = page.locator(`${CONTENT} form`);
  const count = await forms.count();
  const own: number[] = [];
  for (
    let index = 0;
    index < count && own.length < MAX_INLINE_FORMS;
    index += 1
  ) {
    if ((await forms.nth(index).locator("[type=submit]").count()) > 0)
      own.push(index);
  }
  return own.length > 0 || count === 0 ? own : [0];
}

async function checkForms(
  page: Page,
  url: string,
  guard: WriteGuard,
): Promise<Interaction[]> {
  const results: Interaction[] = [];
  for (const index of await inlineForms(page)) {
    results.push(
      await trySubmit(page, page.locator(`${CONTENT} form`).nth(index), guard),
    );
    await openPage(page, url);
  }
  const count = (await openers(page)).length;
  for (let index = 0; index < count; index += 1) {
    const opener = (await openers(page))[index];
    if (opener === undefined) continue;
    const name = await nameOf(opener);
    results.push(
      await checkOpenedForm(page, url, opener, guard).catch(
        (error: unknown) => ({
          kind: "form" as const,
          target: `button "${name}"`,
          ok: false,
          detail: `could not open: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`,
        }),
      ),
    );
  }
  return results;
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
): Promise<Interaction[]> {
  await openPage(page, url);
  const results = [
    ...(await checkLinks(page, origin)),
    ...(await checkTabs(page)),
    ...(await checkSorts(page)),
    ...(await checkFilters(page)),
  ];
  await openPage(page, url);
  return [...results, ...(await checkForms(page, url, guard))];
}
