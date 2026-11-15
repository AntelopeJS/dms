import typescriptParser from "../../frontend-vue/node_modules/@typescript-eslint/parser/dist/index.js";
import vue from "../../frontend-vue/node_modules/eslint-plugin-vue/lib/index.js";

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

/** @type {Form[]} */
const SCRIPT_FORMS = [
  {
    form: "import.meta.glob",
    selector: `CallExpression[callee.object.type="MetaProperty"][callee.property.name=/^glob/] :matches(Literal[value=/${SERVER}/], TemplateElement[value.raw=/${SERVER}/])`,
  },
  {
    form: "new URL(…, import.meta.url)",
    selector: [
      `Literal[value=/${SERVER}/]`,
      `TemplateLiteral > TemplateElement[value.raw=/${SERVER}/]`,
    ]
      .map(
        (path) =>
          `NewExpression[callee.name="URL"][arguments.1.object.type="MetaProperty"][arguments.1.property.name="url"] > ${path}`,
      )
      .join(", "),
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
    form: "a style @import or url()",
    selector: `VDocumentFragment > VElement[name="style"] > VText[value=/(?:@import|url\\()[^;]*${SERVER}/]`,
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
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,vue}"],
    languageOptions: {
      parserOptions: { parser: typescriptParser, sourceType: "module" },
    },
    rules: {
      "no-restricted-syntax": ["error", ...restrictions(SCRIPT_FORMS)],
    },
  },
  {
    files: ["**/*.{ts,mts,cts}"],
    languageOptions: { parser: typescriptParser },
  },
  {
    files: ["**/*.vue"],
    rules: {
      "vue/no-restricted-syntax": ["error", ...restrictions(DOCUMENT_FORMS)],
    },
  },
];
