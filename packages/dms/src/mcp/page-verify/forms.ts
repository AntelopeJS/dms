import {
  CLICK_TIMEOUT_MS,
  CONTENT,
  contentText,
  firstVisible,
  nameOf,
  REACTION_TIMEOUT_MS,
  type WriteGuard,
} from "./controls";
import type { Locator, Page } from "./playwright";
import type { Interaction } from "./report";
import { openPage, waitSettled } from "./render";

const MAX_FORM_OPENERS = 4;
const MAX_INLINE_FORMS = 3;
const OPENER_NAME = /^\s*(new|add|create|edit)\b/i;
const SAMPLE_TEXT = "page_verify";
const SAMPLE_EMAIL = "page-verify@example.com";
const SAMPLE_NUMBER = "1";
const SAMPLE_URL = "https://example.com/";

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
    `[data-dms-page-header-actions] button, ${CONTENT} button:not(form *), ${CONTENT} a[role=button]:not(form *)`,
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

/**
 * The editor a click opened: a form, else a dialog, else the page content
 * once it holds more fields than before, for an editor drawn without a
 * `<form>`.
 */
async function openedEditor(
  page: Page,
  fieldsBefore: number,
): Promise<Locator | undefined> {
  const shown = await firstVisible(
    page.locator("[role=dialog] form, form, [role=dialog]"),
  );
  if (shown !== undefined) return shown;
  const content = page.locator(CONTENT).first();
  return (await content.locator(EDITABLE).count()) > fieldsBefore
    ? content
    : undefined;
}

/** What a click on a button named like an opener did, when it opened no editor. */
export interface ClickEffect {
  wrote: boolean;
  /** The items of the menu the click opened, absent when it opened none. */
  menu?: string[];
  changedPage: boolean;
}

/**
 * A button named like an opener that opened no editor: it acts directly
 * when it sends a write, opens a menu of choices, or changes the page, and
 * does nothing otherwise.
 */
export function withoutEditor(
  effect: ClickEffect,
  guard: WriteGuard,
): FormOutcome {
  if (effect.wrote) {
    return {
      ok: true,
      detail: writeDetail(guard, "no form; the click sent a write"),
    };
  }
  if (effect.menu !== undefined) {
    const items = effect.menu.map((item) => `"${item}"`).join(", ");
    return {
      ok: true,
      detail: `not checked: the click opened a menu${items ? ` of ${items}` : ""}`,
    };
  }
  if (effect.changedPage) {
    return {
      ok: true,
      detail: "not checked: no form opened, but the click changed the page",
    };
  }
  return {
    ok: false,
    detail:
      "nothing happened on click: no form, no write, no change on the page",
  };
}

/**
 * The names of the items of the menu a click opened. A dropdown draws its
 * menu outside the page content, so the content text does not show it.
 */
async function openedMenu(page: Page): Promise<string[] | undefined> {
  const menu = await firstVisible(page.locator("[role=menu]"));
  if (menu === undefined) return undefined;
  const items = menu.locator(
    "[role=menuitem], [role=menuitemcheckbox], [role=menuitemradio]",
  );
  const count = await items.count();
  const names: string[] = [];
  for (let index = 0; index < count; index += 1)
    names.push(await nameOf(items.nth(index)));
  return names.filter((name) => name !== "");
}

async function checkOpenedForm(
  page: Page,
  url: string,
  opener: Locator,
  guard: WriteGuard,
): Promise<Interaction> {
  const name = await nameOf(opener);
  const fieldsBefore = await page.locator(`${CONTENT} ${EDITABLE}`).count();
  const writesBefore = guard.writes.length;
  const textBefore = await contentText(page);
  await opener.click({ timeout: CLICK_TIMEOUT_MS });
  await waitSettled(page);
  const form = await openedEditor(page, fieldsBefore);
  if (form === undefined) {
    const menu = await openedMenu(page);
    const outcome = withoutEditor(
      {
        wrote: guard.writes.length > writesBefore,
        ...(menu !== undefined && { menu }),
        changedPage: (await contentText(page)) !== textBefore,
      },
      guard,
    );
    await openPage(page, url);
    return { kind: "form", target: `button "${name}"`, ...outcome };
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

/**
 * Submits the page's own forms and those its `New`, `Add`, `Create` or
 * `Edit` buttons open, and reports how each answered.
 */
export async function checkForms(
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
