import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const layers = join(root, "layers");
const JsonObject = z.record(z.string(), z.unknown());
const Text = z.string();
const ShortLabels = z.record(z.string(), z.string());
const Manifest = z.object({ dependencies: z.record(z.string(), z.unknown()) });
const ShortcutKeys = z.object({ key: z.array(z.string()) });
const SearchMetadata = ShortcutKeys.extend({
  descriptionKey: z.string(),
  condition: z.object({ descriptionKey: z.string() }),
});

/**
 * @param {string} path
 * @returns {string}
 */
const read = (path) => readFileSync(join(layers, path), "utf8");

/**
 * @param {unknown} node
 * @param {string[]} path
 * @returns {unknown}
 */
export function dig(node, path) {
  let current = node;
  for (const key of path) {
    const record = JsonObject.safeParse(current);
    if (!record.success || !Object.hasOwn(record.data, key)) return undefined;
    current = record.data[key];
  }
  return current;
}

/**
 * @param {string} dir
 * @returns {string[]}
 */
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

function checkInstantSavePages() {
  const settings = "dms-layout/app/custom-pages/settings";
  const parts = "dms-layout/app/build/components/pages/settings";
  const form = "dms-ui/app/components/form/FormBlock.vue";
  const instantSave = [
    `${parts}/theme/useAppearanceSave.ts`,
    `${parts}/notification/NotificationPreferencesForm.vue`,
    form,
  ];
  const noPill = [
    `${settings}/roles.vue`,
    `${settings}/shortcuts.vue`,
    `${parts}/profile/ProfilePersonalInfo.vue`,
    `${parts}/roles/RoleEditor.vue`,
  ];
  for (const path of instantSave) {
    assert.match(read(path), /useInstantSaveHeader\(/, path);
  }
  for (const path of noPill) {
    assert.doesNotMatch(read(path), /useInstantSaveHeader/, path);
  }
  const components = files(layers)
    .filter((path) => path.endsWith(".vue"))
    .map((path) => ({
      path: relative(layers, path).replaceAll("\\", "/"),
      source: readFileSync(path, "utf8"),
    }));
  const users = components.filter(({ source }) =>
    /useInstantSaveHeader\(/.test(source),
  );
  assert.deepEqual(
    users.map(({ path }) => path).sort(),
    instantSave.filter((path) => path.endsWith(".vue")).sort(),
    "instant-save page registry",
  );
  for (const { path, source } of users) {
    if (path !== form) assert.doesNotMatch(source, /DmsSaveBar|saveBar/, path);
  }
  assert.match(read(form), /if \(instantSave && /, "instant-save form mode");
}

function checkServerRouteOwnership() {
  const entry = readFileSync(join(root, "dms.server.ts"), "utf8");
  const routes = [
    ...entry.matchAll(/registerRoute\(\s*"[A-Z]+",\s*"([^"]+)"/g),
  ].map((match) => match[1]);
  const pages = files(resolve(root, "../src/pages/public")).flatMap((path) => {
    const slug = /urlSlug:\s*"([^"]+)"/.exec(readFileSync(path, "utf8"));
    return slug ? [`/${slug[1]}`] : [];
  });
  assert.ok(routes.length > 0, "server route registry must not be empty");
  assert.ok(pages.includes("/auth/signup"), "public signup page must be found");
  assert.deepEqual(
    routes.filter((path) => pages.includes(path)),
    [],
    "server routes must not shadow public pages",
  );
}

function checkSortableDependency() {
  const manifest = Manifest.parse(
    JSON.parse(readFileSync(join(root, "package.json"), "utf8")),
  );
  assert.ok(!Object.hasOwn(manifest.dependencies, "vuedraggable"));
  assert.ok(Object.hasOwn(manifest.dependencies, "sortablejs"));
}

/**
 * @param {string} layer
 * @param {string} prefix
 * @param {string} locale
 * @returns {unknown}
 */
function readLocale(layer, prefix, locale) {
  return JSON.parse(read(`${layer}/i18n/locales/${prefix}-${locale}.json`));
}

function checkFormLoadErrorLabels() {
  const keys = [
    "error_description",
    "error_title",
    "forbidden_description",
    "forbidden_title",
    "missing_description",
    "missing_title",
    "not_found_description",
    "not_found_title",
    "retry",
  ];
  for (const locale of ["en-GB", "fr-FR"]) {
    const messages = readLocale("dms-ui", "ui", locale);
    assert.deepEqual(
      Object.keys(
        JsonObject.parse(dig(messages, ["dms", "form", "load_error"])),
      ).sort(),
      keys,
      `${locale} form load error labels`,
    );
  }
}

async function checkShortcutTranslations() {
  const hook = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
        const base = fileURLToPath(new URL(specifier, context.parentURL));
        for (const path of [`${base}.ts`, join(base, "index.ts")]) {
          if (existsSync(path)) {
            return nextResolve(pathToFileURL(path).href, context);
          }
        }
      }
      return nextResolve(specifier, context);
    },
  });
  try {
    const { default: registry } = await import(
      "../layers/dms-ui/app/config/shortcuts-registry"
    );
    const searchShortcuts = await import(
      "../layers/dms-ui/app/entries/composables/global/searchShortcuts"
    );
    const { NAV_SEARCH_SHORTCUT, PAGE_SEARCH_HINT_KEYS } = searchShortcuts;
    /** @type {unknown[]} */
    const registered = [
      searchShortcuts.GLOBAL_SLASH_METADATA,
      searchShortcuts.GLOBAL_META_SLASH_METADATA,
    ];
    const search = registered.map((metadata) => SearchMetadata.parse(metadata));
    const [slash, metaSlash] = search;
    assert.deepEqual(slash?.key, [NAV_SEARCH_SHORTCUT]);
    assert.deepEqual(
      metaSlash?.key,
      PAGE_SEARCH_HINT_KEYS.map((key) =>
        key === "meta" ? "$keyboard.meta" : key,
      ),
      "displayed search shortcut matches the input hint",
    );
    const global = registry.find((group) => group.component === "Global");
    for (const metadata of registered) {
      assert.ok(
        global?.shortcuts.includes(metadata),
        "search shortcut registration",
      );
    }
    /** @param {string[]} keys */
    const signature = (keys) => keys.join("+").toLowerCase();
    const keys = search.map((metadata) => signature(metadata.key));
    const clashes = registry
      .flatMap(
        /** @returns {unknown[]} */
        (group) => group.shortcuts,
      )
      .filter(
        (shortcut) =>
          !registered.includes(shortcut) &&
          keys.includes(signature(ShortcutKeys.parse(shortcut).key)),
      );
    assert.deepEqual(clashes, [], "search shortcut key conflicts");
    for (const locale of ["en-GB", "fr-FR"]) {
      const messages = readLocale("dms-ui", "ui", locale);
      /** @param {string} key */
      const lookup = (key) => dig(messages, key.slice(1).split("."));
      for (const metadata of search) {
        for (const item of [metadata, metadata.condition]) {
          assert.ok(
            Text.safeParse(lookup(item.descriptionKey)).success,
            `${locale} ${item.descriptionKey}`,
          );
        }
      }
      const layoutMessages = readLocale("dms-layout", "layout", locale);
      for (const { component } of registry) {
        const group = [
          "page",
          "settings",
          "shortcuts",
          "groups",
          component.toLowerCase(),
        ];
        assert.ok(
          Text.safeParse(dig(layoutMessages, [...group, "title"])).success,
          `${locale} ${component} title`,
        );
        assert.ok(
          Text.safeParse(dig(layoutMessages, [...group, "description"]))
            .success,
          `${locale} ${component} description`,
        );
      }
    }
  } finally {
    hook.deregister();
  }
}

function checkLiveLabels() {
  for (const locale of ["en-GB", "fr-FR"]) {
    const messages = readLocale("dms-ui", "ui", locale);
    for (const key of [
      "direct",
      "paused",
      "resume",
      "reason_hidden",
      "polling",
      "table_held",
      "held_row_open",
      "held_searching",
      "held_sorted",
      "held_scrolled",
    ]) {
      assert.ok(dig(messages, ["dms", "live", key]), `${locale} ${key}`);
    }
  }
}

async function checkPeriodLabels() {
  const periodShortLabels = await import(
    "../layers/dms-ui/app/entries/composables/period/periodShortLabels.ts"
  );
  const PRESET_SHORT_LABELS = ShortLabels.parse(
    periodShortLabels.PRESET_SHORT_LABELS,
  );
  const source = readFileSync(
    resolve(root, "../../interface-dms/src/base/period-selector.ts"),
    "utf8",
  );
  const declaration =
    /export const PERIOD_PRESETS = \[([\s\S]*?)\] as const/.exec(source);
  assert.ok(declaration, "period preset registry must be found");
  const presets = [...declaration[1].matchAll(/"([^"]+)"/g)].map(
    (match) => match[1],
  );
  assert.ok(presets.length > 0, "period preset registry must not be empty");
  assert.deepEqual(
    presets.filter(
      (preset) => preset !== "custom" && !PRESET_SHORT_LABELS[preset],
    ),
    [],
    "every non-custom period needs a short code",
  );
  for (const locale of ["en-GB", "fr-FR"]) {
    const labels = ShortLabels.parse(
      dig(readLocale("dms-core", "core", locale), [
        "dms",
        "period",
        "short_presets",
      ]),
    );
    assert.deepEqual(
      Object.keys(labels).sort(),
      Object.keys(PRESET_SHORT_LABELS).sort(),
      `${locale} period short codes`,
    );
    assert.deepEqual(
      Object.values(labels).filter((code) => /^\p{L}$/u.test(code)),
      [],
      `${locale} period codes must not be bare letters`,
    );
  }
}

function checkDevelopmentPlugin() {
  const entry = readFileSync(join(root, "dms.frontend.ts"), "utf8");
  const development = /if \(import\.meta\.env\.DEV\) \{([\s\S]*?)\n {2}\}/.exec(
    entry,
  );
  assert.ok(development, "development plugin scope");
  assert.match(
    development[1],
    /import\(\s*"\.\/layers\/dms-core\/app\/plugins\/dev-error-log"\s*\)[\s\S]*?\{ \.\.\.clientOnly, enforce: "pre" \}/,
    "development logger is browser-only and runs before other plugins",
  );
}

/** @type {[string, () => unknown][]} */
const CHECKS = [
  ["instant-save page registry", checkInstantSavePages],
  ["server route ownership", checkServerRouteOwnership],
  ["sortable dependency", checkSortableDependency],
  ["form load error labels", checkFormLoadErrorLabels],
  ["shortcut translations", checkShortcutTranslations],
  ["live labels", checkLiveLabels],
  ["period short codes", checkPeriodLabels],
  ["development plugin registration", checkDevelopmentPlugin],
];

for (const [name, check] of CHECKS) {
  await check();
  console.log(`PASS ${name}`);
}
