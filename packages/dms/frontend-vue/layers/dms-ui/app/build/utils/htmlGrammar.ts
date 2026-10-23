// HTML as the editor's language reads it (`@codemirror/lang-html`): scripts,
// styles, `style` attributes and event handlers parsed in their own
// languages, from the lezer grammars alone. The nesting mirrors lang-html's
// defaults, so a snippet colours HTML exactly like the editor. A module of its
// own because HTML is the one grammar composed of others.
import { parser as cssParser } from "@lezer/css";
import { configureNesting, parser } from "@lezer/html";
import { parser as javascriptParser } from "@lezer/javascript";

// What lezer read of a tag's attributes; an absent one is undefined.
type Attributes = Readonly<Record<string, string | undefined>>;

const typescriptParser = javascriptParser.configure({ dialect: "ts" });
// A JSON script holds one value, read as JavaScript reads it.
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

/** The HTML grammar, with its embedded languages. */
export const htmlParser = parser.configure({
  wrap: configureNesting(NESTED_TAGS, NESTED_ATTRIBUTES),
});
