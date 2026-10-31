import {
  describeTarget,
  locate,
  perform,
  signInThroughForm,
} from "./browser.mjs";

const EXPECT_TIMEOUT_MS = 15_000;
const POLL_MS = 250;
const DETAIL_LENGTH = 300;

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
   * @param {Record<string, any>} action The action, as `perform` takes it
   * @param {string} label What the step does
   * @returns {Promise<{ ok: boolean, url: string, error: string | null, aria: string, folder: string }>} The outcome
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

  /** Opens a path of the frontend. */
  goto(path) {
    return this.act({ do: "goto", path }, `open ${path}`);
  }

  /** Reloads the page. */
  reload() {
    return this.act({ do: "reload" }, "reload");
  }

  /** Clicks a target found by role and name. */
  click(target) {
    return this.act({ do: "click", target }, `click ${describeTarget(target)}`);
  }

  /** Types into a target found by role and name, replacing its value. */
  fill(target, value) {
    return this.act(
      { do: "fill", target, value },
      `fill ${describeTarget(target)}`,
    );
  }

  /** Chooses an option of a native select by its label. */
  select(target, value) {
    return this.act(
      { do: "select", target, value },
      `select ${value} in ${describeTarget(target)}`,
    );
  }

  /** Ticks a checkbox or switch. */
  check(target) {
    return this.act({ do: "check", target }, `check ${describeTarget(target)}`);
  }

  /** Presses a key, on a target or on the page. */
  press(key, target) {
    const where = target ? ` in ${describeTarget(target)}` : "";
    return this.act({ do: "press", key, target }, `press ${key}${where}`);
  }

  /** Records the page as it is now. */
  snapshot(label) {
    return this.act({ do: "snapshot" }, label);
  }

  /** Signs an account of the journey in through the sign-in form. */
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

  /** The Playwright locator of a target. */
  locator(target) {
    return locate(this.page, target);
  }

  /**
   * A check that a target becomes visible, or with `{ hidden: true }`
   * hidden or absent, within the timeout.
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

  /** A check that a target is enabled (or, with `{ disabled: true }`, disabled). */
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

  /** A check that the page shows (or, with `{ not: true }`, never shows) text matching `pattern`. */
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

  /** A check that the current path matches `pattern` within the timeout. */
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

  /** A check on how many targets match. */
  async count(target, expected) {
    const actual = await this.locator(target).count();
    return {
      name: `${expected} × ${describeTarget(target)}`,
      pass: actual === expected,
      detail: `found ${actual}`,
    };
  }

  /** The current value of a form field. */
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
