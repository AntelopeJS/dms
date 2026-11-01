import {
  describeTarget,
  locate,
  perform,
  signInThroughForm,
} from "./browser.mjs";

/**
 * @typedef {import("./browser.mjs").Action} Action
 * @typedef {import("./browser.mjs").Outcome} Outcome
 * @typedef {import("./browser.mjs").Target} Target
 * @typedef {import("./journey.mjs").Check} Check
 * @typedef {{ timeoutMs?: number }} Timeout
 */

const EXPECT_TIMEOUT_MS = 15_000;
const POLL_MS = 250;
const DETAIL_LENGTH = 300;

/**
 * @param {string} text The text
 * @returns {string} The text on one line, cut to the detail length
 */
function flatten(text) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > DETAIL_LENGTH
    ? `${flat.slice(0, DETAIL_LENGTH)}…`
    : flat;
}

/**
 * A browser tab a journey drives, as one account. Each action writes a
 * numbered step folder with the action, the URL, the ARIA snapshot and a
 * screenshot. An action whose target is missing, hidden or disabled fails
 * the step and ends the journey.
 */
export class Tab {
  /**
   * @param {import("./journey.mjs").JourneyContext} context The journey
   * @param {import("playwright-core").Page} page The Playwright page
   * @param {string} label The tab's name in evidence
   */
  constructor(context, page, label) {
    this.context = context;
    this.page = page;
    this.label = label;
  }

  /**
   * Runs one browser action and records it as a critical step.
   *
   * @param {Omit<Action, "baseUrl">} action The action, as `perform` takes it
   * @param {string} label What the step does
   * @returns {Promise<Outcome & { folder: string }>} The outcome
   */
  async act(action, label) {
    const folder = this.context.step(`${this.label} ${label}`);
    const outcome = await perform(
      this.page,
      { ...action, baseUrl: this.context.state.webUrl },
      folder,
    );
    this.context.record(
      folder,
      [{ name: label, pass: outcome.ok, detail: outcome.error ?? outcome.url }],
      { critical: true },
    );
    return { ...outcome, folder };
  }

  /**
   * Opens a path of the frontend. Callers pass link lookups that are
   * `undefined` when no link matched; the navigation then targets the
   * literal path `undefined`.
   *
   * @param {string | undefined} path The path
   * @returns {Promise<Outcome & { folder: string }>} The outcome
   */
  goto(path) {
    return this.act({ do: "goto", path }, `open ${path}`);
  }

  /**
   * Reloads the page.
   *
   * @returns {Promise<Outcome & { folder: string }>} The outcome
   */
  reload() {
    return this.act({ do: "reload" }, "reload");
  }

  /**
   * Clicks a target found by role and name.
   *
   * @param {Target} target What to click
   * @returns {Promise<Outcome & { folder: string }>} The outcome
   */
  click(target) {
    return this.act({ do: "click", target }, `click ${describeTarget(target)}`);
  }

  /**
   * Types into a target found by role and name, replacing its value.
   *
   * @param {Target} target What to fill
   * @param {string} value The new value
   * @returns {Promise<Outcome & { folder: string }>} The outcome
   */
  fill(target, value) {
    return this.act(
      { do: "fill", target, value },
      `fill ${describeTarget(target)}`,
    );
  }

  /**
   * Chooses an option of a native select by its label.
   *
   * @param {Target} target The select
   * @param {string} value The option label
   * @returns {Promise<Outcome & { folder: string }>} The outcome
   */
  select(target, value) {
    return this.act(
      { do: "select", target, value },
      `select ${value} in ${describeTarget(target)}`,
    );
  }

  /**
   * Ticks a checkbox or switch.
   *
   * @param {Target} target The checkbox or switch
   * @returns {Promise<Outcome & { folder: string }>} The outcome
   */
  check(target) {
    return this.act({ do: "check", target }, `check ${describeTarget(target)}`);
  }

  /**
   * Presses a key, on a target or on the page.
   *
   * @param {string} key The key
   * @param {Target} [target] Where to press it
   * @returns {Promise<Outcome & { folder: string }>} The outcome
   */
  press(key, target) {
    const where = target ? ` in ${describeTarget(target)}` : "";
    return this.act({ do: "press", key, target }, `press ${key}${where}`);
  }

  /**
   * Records the page as it is now.
   *
   * @param {string} label What the step records
   * @returns {Promise<Outcome & { folder: string }>} The outcome
   */
  snapshot(label) {
    return this.act({ do: "snapshot" }, label);
  }

  /**
   * Signs an account of the journey in through the sign-in form.
   *
   * @param {string} account The account name
   * @returns {Promise<Outcome | { ok: boolean, url: string, error: string }>} The outcome of the last sign-in step, or a failure without a snapshot when the journey has no such account
   */
  async signIn(account) {
    const credentials = this.context.state.accounts?.[account];
    const outcome = credentials
      ? await signInThroughForm(this.page, credentials, {
          baseUrl: this.context.state.webUrl,
          folder: (label) => this.context.step(`${this.label} ${label}`),
        })
      : { ok: false, url: "", error: `no account ${account}` };
    const folder = this.context.step(`${this.label} signed in as ${account}`);
    this.context.record(
      folder,
      [
        {
          name: `${account} signs in and leaves /auth`,
          pass: outcome.ok,
          detail: outcome.error ?? outcome.url,
        },
      ],
      { critical: true },
    );
    return outcome;
  }

  /**
   * The Playwright locator of a target.
   *
   * @param {Target} target What to find
   * @returns {import("playwright-core").Locator} The locator
   */
  locator(target) {
    return locate(this.page, target);
  }

  /**
   * A check that a target becomes visible, or with `{ hidden: true }`
   * hidden or absent, within the timeout.
   *
   * @param {Target} target What to wait for
   * @param {Timeout & { hidden?: boolean }} [options] Whether to wait for it to be hidden, and how long
   * @returns {Promise<Check>} The check
   */
  async visible(target, options = {}) {
    const state = options.hidden ? "hidden" : "visible";
    const reached = await this.locator(target)
      .first()
      .waitFor({ state, timeout: options.timeoutMs ?? EXPECT_TIMEOUT_MS })
      .then(
        () => true,
        () => false,
      );
    return {
      name: `${describeTarget(target)} is ${options.hidden ? "absent" : "visible"}`,
      pass: reached,
      detail: this.page.url(),
    };
  }

  /**
   * A check that a target is enabled (or, with `{ disabled: true }`, disabled).
   *
   * @param {Target} target The control
   * @param {Timeout & { disabled?: boolean }} [options] Whether to expect it disabled, and how long
   * @returns {Promise<Check>} The check
   */
  async enabled(target, options = {}) {
    const element = this.locator(target).first();
    const disabled = await element
      .isDisabled({ timeout: options.timeoutMs ?? EXPECT_TIMEOUT_MS })
      .catch(() => null);
    const want = Boolean(options.disabled);
    return {
      name: `${describeTarget(target)} is ${want ? "disabled" : "enabled"}`,
      pass: disabled === want,
      detail: disabled === null ? "not found" : `disabled=${disabled}`,
    };
  }

  /**
   * A check that the page shows (or, with `{ not: true }`, never shows) text matching `pattern`.
   *
   * @param {RegExp} pattern The text to match
   * @param {Timeout & { not?: boolean }} [options] Whether the text must never show, and how long
   * @returns {Promise<Check>} The check
   */
  async shows(pattern, options = {}) {
    const deadline = Date.now() + (options.timeoutMs ?? EXPECT_TIMEOUT_MS);
    let text = "";
    while (Date.now() < deadline) {
      text = await this.page
        .locator("body")
        .innerText()
        .catch(() => "");
      if (pattern.test(text) !== Boolean(options.not)) break;
      await this.page.waitForTimeout(POLL_MS);
    }
    return {
      name: `page ${options.not ? "does not show" : "shows"} ${pattern}`,
      pass: pattern.test(text) !== Boolean(options.not),
      detail: flatten(text),
    };
  }

  /**
   * A check that the current path matches `pattern` within the timeout.
   *
   * @param {RegExp} pattern The path to match
   * @param {Timeout} [options] How long to wait
   * @returns {Promise<Check>} The check
   */
  async at(pattern, options = {}) {
    const reached = await this.page
      .waitForURL((url) => pattern.test(url.pathname), {
        timeout: options.timeoutMs ?? EXPECT_TIMEOUT_MS,
      })
      .then(
        () => true,
        () => false,
      );
    return {
      name: `path matches ${pattern}`,
      pass: reached,
      detail: new URL(this.page.url()).pathname,
    };
  }

  /**
   * A check on how many targets match.
   *
   * @param {Target} target What to count
   * @param {number} expected How many should match
   * @returns {Promise<Check>} The check
   */
  async count(target, expected) {
    const actual = await this.locator(target).count();
    return {
      name: `${expected} × ${describeTarget(target)}`,
      pass: actual === expected,
      detail: `found ${actual}`,
    };
  }

  /**
   * The current value of a form field.
   *
   * @param {Target} target The form field
   * @returns {Promise<string>} The value
   */
  value(target) {
    return this.locator(target)
      .first()
      .inputValue({ timeout: EXPECT_TIMEOUT_MS });
  }

  /** Closes the tab. */
  close() {
    return this.page.close();
  }
}
