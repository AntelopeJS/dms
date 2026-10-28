import { parser as cssParser } from "@lezer/css";
import { configureNesting, parser } from "@lezer/html";
import { parser as javascriptParser } from "@lezer/javascript";

type Attributes = Readonly<Record<string, string | undefined>>;

const typescriptParser = javascriptParser.configure({ dialect: "ts" });

const jsonScriptParser = javascriptParser.configure({
  top: "SingleExpression",
});

const JSON_SCRIPT_TYPE =
  /^(importmap|speculationrules|application\/(.+\+)?json)$/i;
const JAVASCRIPT_TYPE =
  /^(?:text|application)\/(?:x-)?(?:java|ecma)script$|^module$|^$/i;
const CSS_TYPE = /^(text\/)?(x-)?(stylesheet|css)$/i;

const NESTED_TAGS = [
  {
    tag: "script",
    attrs: (attrs: Attributes) =>
      attrs.type === "text/typescript" || attrs.lang === "ts",
    parser: typescriptParser,
  },
  {
    tag: "script",
    attrs: (attrs: Attributes) =>
      attrs.type === "text/babel" || attrs.type === "text/jsx",
    parser: javascriptParser.configure({ dialect: "jsx" }),
  },
  {
    tag: "script",
    attrs: (attrs: Attributes) => attrs.type === "text/typescript-jsx",
    parser: javascriptParser.configure({ dialect: "jsx ts" }),
  },
  {
    tag: "script",
    attrs: (attrs: Attributes) => JSON_SCRIPT_TYPE.test(attrs.type ?? ""),
    parser: jsonScriptParser,
  },
  {
    tag: "script",
    attrs: (attrs: Attributes) =>
      !attrs.type || JAVASCRIPT_TYPE.test(attrs.type),
    parser: javascriptParser,
  },
  {
    tag: "style",
    attrs: (attrs: Attributes) =>
      (!attrs.lang || attrs.lang === "css") &&
      (!attrs.type || CSS_TYPE.test(attrs.type)),
    parser: cssParser,
  },
];

const EVENT_ATTRIBUTES = (
  "beforeunload copy cut dragstart dragover dragleave dragenter dragend " +
  "drag paste focus blur change click load mousedown mouseenter mouseleave " +
  "mouseup keydown keyup resize scroll unload"
)
  .split(" ")
  .map((name) => `on${name}`);

const NESTED_ATTRIBUTES = [
  { name: "style", parser: cssParser.configure({ top: "Styles" }) },
  ...EVENT_ATTRIBUTES.map((name) => ({ name, parser: javascriptParser })),
];

/**
 * The HTML grammar, with its embedded languages. Keep nesting aligned with
 * `@codemirror/lang-html` defaults so snippets and the editor color the same
 * code alike. Use the Lezer grammars here without loading the editor state
 * or view into pages that only display snippets.
 */
export const htmlParser = parser.configure({
  wrap: configureNesting(NESTED_TAGS, NESTED_ATTRIBUTES),
});
