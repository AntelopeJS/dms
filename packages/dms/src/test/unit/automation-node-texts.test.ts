import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect } from "chai";
import type { JsonSchema } from "@antelopejs/interface-dms-automation";
import { ACTIONS } from "../../automation/actions";
import { TRIGGERS } from "../../automation/triggers";

const PACKAGE_ROOT = resolve(__dirname, "..", "..", "..");
const LOCALES_DIR = resolve(
  PACKAGE_ROOT,
  "frontend-vue/layers/dms-core/i18n/locales",
);
const LOCALE_FILES = { en: "core-en-GB.json", fr: "core-fr-FR.json" };

type LocaleTree = { [key: string]: string | LocaleTree };

interface NodeText {
  where: string;
  text: unknown;
}

function loadLocale(file: string): LocaleTree {
  return JSON.parse(readFileSync(resolve(LOCALES_DIR, file), "utf8"));
}

function lookup(tree: LocaleTree, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (node, part) => (node as LocaleTree | undefined)?.[part],
      tree,
    );
}

// Every text the builder shows for a schema: each field's title, and its
// description when it has one.
function schemaTexts(where: string, schema: JsonSchema): NodeText[] {
  const properties = (schema.properties ?? {}) as Record<string, JsonSchema>;
  return Object.entries(properties).flatMap(([name, property]) => [
    { where: `${where}.${name}.title`, text: property.title },
    ...(property.description === undefined
      ? []
      : [
          { where: `${where}.${name}.description`, text: property.description },
        ]),
  ]);
}

function nodeTexts(): NodeText[] {
  const triggers = TRIGGERS.flatMap((trigger) => [
    { where: `${trigger.id}.name`, text: trigger.name },
    { where: `${trigger.id}.description`, text: trigger.description },
    ...schemaTexts(`${trigger.id}.config`, trigger.configSchema),
    ...schemaTexts(`${trigger.id}.output`, trigger.outputSchema),
  ]);
  const actions = ACTIONS.flatMap((action) => [
    { where: `${action.id}.name`, text: action.name },
    { where: `${action.id}.description`, text: action.description },
    ...schemaTexts(`${action.id}.input`, action.inputSchema),
    ...schemaTexts(`${action.id}.output`, action.outputSchema),
  ]);
  return [...triggers, ...actions];
}

describe("[unit] automation — node texts", () => {
  const texts = nodeTexts();

  it("gives every node and field text a $ key of the DMS locales", () => {
    const literal = texts.filter(
      ({ text }) =>
        typeof text !== "string" || !text.startsWith("$dms.automation."),
    );
    expect(literal.map(({ where }) => where)).to.deep.equal([]);
  });

  for (const [language, file] of Object.entries(LOCALE_FILES)) {
    it(`translates every node and field text in ${language}`, () => {
      const locale = loadLocale(file);
      const missing = texts.filter(({ text }) => {
        const message = lookup(locale, String(text).slice(1));
        return typeof message !== "string" || message.trim() === "";
      });
      expect(
        missing.map(({ where, text }) => `${where} (${String(text)})`),
      ).to.deep.equal([]);
    });
  }
});
