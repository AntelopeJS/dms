import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const [url, theme = "custom", screenshots] = process.argv.slice(2);
if (!url)
  throw new Error(
    "Usage: node tests/theming-browser.mjs URL [custom|default] [screenshots]",
  );
const session = "dms-theming-test";
const transitionWait = "500";
const browser = (...args) =>
  execFileSync("agent-browser", ["--session", session, ...args], {
    encoding: "utf8",
  }).trim();
const evaluate = (expression) => JSON.parse(browser("eval", expression));

function inspectTheme() {
  const root = getComputedStyle(document.documentElement);
  const probe = document.createElement("span");
  document.body.append(probe);
  const colors = ["--ui-primary", "--ui-color-primary-600", "--ui-success"].map(
    (token) => {
      probe.style.backgroundColor = `var(${token})`;
      return getComputedStyle(probe).backgroundColor;
    },
  );
  probe.remove();
  const background = (selector) =>
    getComputedStyle(document.querySelector(selector)).backgroundColor;
  const images = [...document.querySelectorAll("main img")].filter(
    (image) => image.getClientRects().length,
  );
  return {
    radius: root.getPropertyValue("--ui-radius").trim(),
    font: root.getPropertyValue("--font-sans"),
    accent: root.getPropertyValue("--dms-accent").trim(),
    accentPalette: ["500", "400"].map((shade) =>
      root.getPropertyValue(`--ui-color-primary-${shade}`).trim(),
    ),
    config: document.querySelector("#config").textContent,
    colors,
    button: background("#primary"),
    primary: background("#primary-switch"),
    success: background("#success-switch"),
    surface: background(".dms-card"),
    logosLoaded:
      images.length === 2 &&
      images.every((image) => image.complete && image.naturalWidth > 0),
    logos: images.map((image) => new URL(image.src).pathname),
  };
}

function checkLogos(result, mode) {
  assert.ok(result.logosLoaded, "logos loaded");
  const logoRoot = theme === "custom" ? "/brand" : "/images/antelope-logo";
  assert.deepEqual(result.logos, [
    `${logoRoot}/${mode}.svg`,
    `${logoRoot}/icon.svg`,
  ]);
}

function checkTheme(mode) {
  const result = evaluate(`(${inspectTheme.toString()})()`);
  const isCustom = theme === "custom";
  assert.ok(result.radius.endsWith("rem"), "radius unit");
  assert.equal(
    Number.parseFloat(result.radius),
    isCustom ? 0.5 : 0.25,
    "radius",
  );
  assert.ok(result.font.includes(isCustom ? "Georgia" : "Geist"), "font");
  assert.ok(
    result.config.includes(isCustom ? "example" : "dms"),
    "layer precedence",
  );
  assert.equal(result.button, result.colors[0], "primary action");
  assert.equal(result.primary, result.colors[1], "primary switch shade");
  assert.equal(
    result.success,
    result.colors[2],
    "success switch semantic color",
  );
  const darkSurface = isCustom ? "rgb(36, 21, 54)" : "rgb(16, 17, 25)";
  assert.equal(
    result.surface,
    mode === "dark" ? darkSurface : "rgb(255, 255, 255)",
  );
  assert.equal(
    result.accent,
    result.accentPalette[Number(mode === "dark")],
    "glow accent",
  );
  checkLogos(result, mode);
  console.log(`${theme}/${mode}: tokens, switches and logos passed`);
}

function checkMode(mode) {
  const modeCondition = `document.documentElement.classList.contains('dark') === ${mode === "dark"}`;
  if (!evaluate(modeCondition)) browser("click", "#mode");
  browser("wait", "--fn", modeCondition);
  browser("wait", transitionWait);
  checkTheme(mode);
  browser("click", "#primary-switch");
  browser(
    "wait",
    "--fn",
    'document.querySelector("#primary-switch").getAttribute("aria-checked") === "false"',
  );
  browser("click", "#primary-switch");
  browser("wait", transitionWait);
  checkTheme(mode);
  if (!screenshots) return;
  mkdirSync(screenshots, { recursive: true });
  browser("screenshot", resolve(screenshots, `${theme}-${mode}.png`));
}

try {
  browser("open", url);
  browser("set", "viewport", "1280", "900", "2");
  browser(
    "wait",
    "--fn",
    'document.querySelector("main")?.dataset.ready === "true"',
  );
  for (const mode of ["light", "dark"]) checkMode(mode);
} finally {
  browser("close");
}
