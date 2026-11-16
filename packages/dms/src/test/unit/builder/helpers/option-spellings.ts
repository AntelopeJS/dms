import fc from "fast-check";

/** What an option holds. */
export type OptionKind = "string" | "number" | "boolean";

/** How the source of a page, a category or a block writes one option. */
export type OptionForm =
  | "literal"
  | "constant"
  | "import"
  | "namespace"
  | "enum"
  | "importedEnum"
  | "template"
  | "shorthand"
  | "call";

/** One option of a generated source: its value and the way it is written. */
export interface OptionSpelling {
  key: string;
  kind: OptionKind;
  value: string | number | boolean;
  form: OptionForm;
  split: number;
}

/** What the source needs around the options it writes. */
export interface OptionSource {
  /** The module the source imports its constants from, such as `./values`. */
  module: string;
  /** Starts the name of each constant, so two sources of one file keep theirs apart. */
  prefix: string;
  imports: string[];
  declarations: string[];
  values: string[];
  entries: string[];
}

const STRING_FORMS: OptionForm[] = [
  "literal",
  "constant",
  "import",
  "namespace",
  "enum",
  "importedEnum",
  "template",
  "shorthand",
  "call",
];
const NUMBER_FORMS: OptionForm[] = [
  "literal",
  "constant",
  "import",
  "namespace",
  "enum",
  "importedEnum",
  "shorthand",
  "call",
];
const BOOLEAN_FORMS: OptionForm[] = [
  "literal",
  "constant",
  "import",
  "namespace",
  "shorthand",
  "call",
];

/** Forms whose value the builder reads from the source: a call runs code, and a namespace import is read as nothing, see the findings. */
export function isRead(form: OptionForm): boolean {
  return form !== "call" && form !== "namespace";
}

function formsOf(kind: OptionKind): OptionForm[] {
  if (kind === "string") {
    return STRING_FORMS;
  }
  return kind === "number" ? NUMBER_FORMS : BOOLEAN_FORMS;
}

function valueOf(
  kind: OptionKind,
  width: number,
): fc.Arbitrary<string | number | boolean> {
  if (kind === "string") {
    return fc.stringMatching(
      new RegExp(`^[A-Za-z0-9][A-Za-z0-9 ./:-]{0,${width - 1}}$`),
    );
  }
  return kind === "number" ? fc.integer({ min: -9, max: 999 }) : fc.boolean();
}

/** An option of `kind` under `key`, written in any form that fits its kind. */
export function optionSpelling(
  key: string,
  kind: OptionKind,
  width = 12,
): fc.Arbitrary<OptionSpelling> {
  return fc.record({
    key: fc.constant(key),
    kind: fc.constant(kind),
    value: valueOf(kind, width),
    form: fc.constantFrom(...formsOf(kind)),
    split: fc.nat(),
  });
}

function literal(value: string | number | boolean): string {
  return JSON.stringify(value);
}

/**
 * Writes the option the way its form says: the entry that goes in the options
 * object, and the statements the entry reads. `index` keeps names apart.
 */
export function writeOption(
  option: OptionSpelling,
  index: number,
  source: OptionSource,
): void {
  const { key, value, form } = option;
  const name = `${source.prefix}${index}`;
  const expression = ((): string => {
    switch (form) {
      case "literal":
        return literal(value);
      case "constant":
        source.declarations.push(`const ${name} = ${literal(value)};`);
        return name;
      case "import":
        source.values.push(`export const ${name} = ${literal(value)};`);
        source.imports.push(`import { ${name} } from "${source.module}";`);
        return name;
      case "namespace":
        source.values.push(`export const ${name} = ${literal(value)};`);
        source.imports.push(`import * as Values from "${source.module}";`);
        return `Values.${name}`;
      case "enum":
        source.declarations.push(
          `${option.split % 2 === 0 ? "enum" : "const enum"} E${name} { member = ${literal(value)} }`,
        );
        return `E${name}.member`;
      case "importedEnum":
        source.values.push(
          `export enum E${name} { member = ${literal(value)} }`,
        );
        source.imports.push(`import { E${name} } from "${source.module}";`);
        return `E${name}.member`;
      case "template": {
        const text = String(value);
        const cut = option.split % (text.length + 1);
        source.declarations.push(
          `const P${name} = ${literal(text.slice(0, cut))};`,
        );
        return `\`\${P${name}}${text.slice(cut)}\``;
      }
      case "shorthand":
        source.declarations.push(`const ${key} = ${literal(value)};`);
        return "";
      case "call":
        return `${option.kind}For(${literal(value)})`;
    }
  })();
  source.entries.push(form === "shorthand" ? key : `${key}: ${expression}`);
}

/** The functions an option written as a call needs. */
export const CALL_HELPERS = [
  "function stringFor(name: string): string {\n  return name.toUpperCase();\n}",
  "function numberFor(count: number): number {\n  return count * 2;\n}",
  "function booleanFor(flag: boolean): boolean {\n  return !flag;\n}",
].join("\n\n");
