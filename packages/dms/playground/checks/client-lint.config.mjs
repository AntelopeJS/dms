import typescriptParser from "@typescript-eslint/parser";
import vue from "eslint-plugin-vue";

/**
 * A path into the playground's server source or its build: a relative path that
 * climbs into `src` or `dist`, or any path through `playground/src` or `playground/dist`.
 * Selectors cannot hold a slash, so it is written `\x2F`.
 */
const SERVER = String.raw`(?:(?<![\w.-])(?:\.\.\x2F)+|playground\x2F)(?:src|dist)(?![\w.-])`;

/**
 * @typedef {{ form: string, selector: string }} Form
 * A way client code loads a file that dependency-cruiser does not read.
 */

/**
 * A template literal part that reaches server code, or that ends on a `../` climb,
 * where the interpolation that follows can name `src` or `dist`.
 */
const TEMPLATE_SERVER = String.raw`${SERVER}|(?<![\w.-])(?:\.\.\x2F)+$`;

/** The string arguments of a call that loads a path. */
const PATH_ARGUMENTS = [
  `Literal[value=/${SERVER}/]`,
  `TemplateLiteral > TemplateElement[value.raw=/${TEMPLATE_SERVER}/]`,
];

/**
 * @param {string} call
 * @returns {string}
 */
const pathArgumentOf = (call) =>
  PATH_ARGUMENTS.map((path) => `${call} > ${path}`).join(", ");

/** @type {Form[]} */
const SCRIPT_FORMS = [
  {
    form: "import.meta.glob",
    selector: `CallExpression[callee.object.type="MetaProperty"][callee.property.name=/^glob/] :matches(Literal[value=/${SERVER}/], TemplateElement[value.raw=/${TEMPLATE_SERVER}/])`,
  },
  {
    form: "new URL(…, import.meta.url)",
    selector: pathArgumentOf(
      `NewExpression[callee.name="URL"][arguments.1.object.type="MetaProperty"][arguments.1.property.name="url"]`,
    ),
  },
  {
    form: "an interpolated dynamic import",
    selector: `ImportExpression > TemplateLiteral > TemplateElement[value.raw=/${TEMPLATE_SERVER}/]`,
  },
];

/** @type {Form[]} */
const DOCUMENT_FORMS = [
  {
    form: "a template asset attribute",
    selector: `VElement[parent.type!="VDocumentFragment"] > VStartTag > VAttribute[directive=false][key.name=/^(?:src|srcset|href|poster|xlink:href)$/][value.value=/${SERVER}/]`,
  },
  {
    form: "a block src attribute",
    selector: `VDocumentFragment > VElement > VStartTag > VAttribute[directive=false][key.name="src"][value.value=/${SERVER}/]`,
  },
  {
    form: "a style block path",
    selector: `VDocumentFragment > VElement[name="style"] > VText[value=/${SERVER}/]`,
  },
];

/**
 * @param {Form[]} forms
 * @returns {{ selector: string, message: string }[]}
 */
const restrictions = (forms) =>
  forms.map(({ form, selector }) => ({
    selector,
    message: `Client code reaches the playground server through ${form}. Serve the value through an API route or move it into the client layer.`,
  }));

export default [
  { ignores: ["node_modules/**", ".nuxt/**", ".output/**"] },
  ...vue.configs["flat/base"],
  {
    files: ["**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx,vue}"],
    languageOptions: {
      parserOptions: { parser: typescriptParser, sourceType: "module" },
    },
    rules: {
      "no-restricted-syntax": ["error", ...restrictions(SCRIPT_FORMS)],
    },
  },
  {
    files: ["**/*.{ts,mts,cts,tsx}"],
    languageOptions: { parser: typescriptParser },
  },
  {
    files: ["**/*.vue"],
    rules: {
      "vue/no-restricted-syntax": ["error", ...restrictions(DOCUMENT_FORMS)],
    },
  },
];
