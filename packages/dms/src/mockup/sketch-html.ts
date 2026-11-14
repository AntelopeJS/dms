import {
  type DefaultTreeAdapterTypes,
  defaultTreeAdapter,
  html,
  parse,
  serialize,
  type Token,
} from "parse5";
import {
  ALLOWLISTS,
  FREE_ATTRIBUTE,
  type NamespaceAllowlist,
  type UrlForm,
} from "./sketch-allowlist";
import { cssRefusals, localUrlForm } from "./sketch-css";
import { SKETCH_MAX_SOURCE } from "./sketch-limits";
import { moreAttributesThan } from "./sketch-scan";

type Node = DefaultTreeAdapterTypes.Node;
type Element = DefaultTreeAdapterTypes.Element;
type ParentNode = DefaultTreeAdapterTypes.ParentNode;

/** A frame document, or the bound its parse passed and what the sketch then holds. */
type FrameParse =
  | { ok: true; document: DefaultTreeAdapterTypes.Document }
  | { ok: false; refusal: string };

/** Thrown inside a parse that passes a bound, to stop it there. */
class ParseBound extends Error {
  constructor(readonly refusal: string) {
    super(refusal);
  }
}

function attributeCharacters(attrs: Token.Attribute[]): number {
  return attrs.reduce(
    (total, attribute) =>
      total + attribute.name.length + attribute.value.length,
    0,
  );
}

/**
 * The document the viewer's frame draws a sketch in, around `body`. The frame
 * is sandboxed without scripts, so it parses with scripting disabled, as this
 * does.
 *
 * Every element the parser builds goes through `createElement`, with its
 * attributes: one per tag, and every copy parse5 makes of an open formatting
 * element it rebuilds, of an element the adoption agency moves, or of one
 * foster parenting places. So counting there bounds what the parse
 * materialises: at most {@link MAX_ELEMENTS} elements carrying at most
 * {@link MAX_ATTRIBUTE_CHARACTERS} characters of attributes, whatever the
 * input makes parse5 copy. An `<html>` or `<body>` start tag inside the body
 * merges its attributes into the existing element without `createElement`; a
 * sketch may not write those, so the merge stops the parse.
 */
function frameDocument(head: string, body: string): FrameParse {
  let elements = 0;
  let characters = 0;
  const treeAdapter: typeof defaultTreeAdapter = {
    ...defaultTreeAdapter,
    createElement(tagName, namespaceURI, attrs) {
      elements += 1;
      characters += attributeCharacters(attrs);
      if (elements > MAX_ELEMENTS) {
        throw new ParseBound(
          `markup that makes the parser build more than ${MAX_ELEMENTS} elements`,
        );
      }
      if (characters > MAX_ATTRIBUTE_CHARACTERS) {
        throw new ParseBound(
          `markup that makes the parser copy more than ${MAX_ATTRIBUTE_CHARACTERS} characters of attributes`,
        );
      }
      return defaultTreeAdapter.createElement(tagName, namespaceURI, attrs);
    },
    adoptAttributes(recipient, attrs) {
      if (attrs.length > 0) {
        throw new ParseBound("an <html>, <head> or <body> tag");
      }
      defaultTreeAdapter.adoptAttributes(recipient, attrs);
    },
  };
  try {
    const document = parse(
      `<!doctype html><html><head>${head}</head><body>${body}</body></html>`,
      { scriptingEnabled: false, treeAdapter },
    );
    return { ok: true, document };
  } catch (error) {
    if (error instanceof ParseBound)
      return { ok: false, refusal: error.refusal };
    throw error;
  }
}

function elementChildren(node: ParentNode): Element[] {
  return node.childNodes.filter((childNode): childNode is Element =>
    defaultTreeAdapter.isElementNode(childNode),
  );
}

function child(node: ParentNode, name: string): Element | undefined {
  return elementChildren(node).find((element) => element.tagName === name);
}

function attributeName(
  attribute: DefaultTreeAdapterTypes.Element["attrs"][number],
): string {
  return attribute.prefix
    ? `${attribute.prefix}:${attribute.name}`
    : attribute.name;
}

function textOf(element: Element): string {
  return element.childNodes
    .map((node) => (defaultTreeAdapter.isTextNode(node) ? node.value : ""))
    .join("");
}

function allowsAttribute(
  allowlist: NamespaceAllowlist,
  element: string,
  name: string,
): boolean {
  return (
    allowlist.global.has(name) ||
    FREE_ATTRIBUTE.test(name) ||
    (allowlist.byElement.get(element)?.has(name) ?? false)
  );
}

const URL_FORM_REFUSAL: Record<UrlForm, string> = {
  anchor: "an #anchor",
  image: "a data:image/ URL",
};

function attributeRefusals(
  allowlist: NamespaceAllowlist,
  element: Element,
): string[] {
  const tag = `<${element.tagName}>`;
  return element.attrs.flatMap((attribute) => {
    const name = attributeName(attribute);
    if (!allowsAttribute(allowlist, element.tagName, name)) {
      return [
        `a${/^[aeiou]/i.test(name) ? "n" : ""} ${name} attribute on ${allowlist.label}${tag}`,
      ];
    }
    const form = allowlist.urls.get(element.tagName)?.get(name);
    if (form !== undefined) {
      return localUrlForm(attribute.value) === form
        ? []
        : [
            `a ${name} on ${allowlist.label}${tag} that is not ${URL_FORM_REFUSAL[form]}`,
          ];
    }
    if (name === "style" || allowlist.valuesAreCss)
      return cssRefusals(attribute.value);
    return [];
  });
}

/** What `element` and its descendants hold that a sketch may not. */
function treeRefusals(element: Element): string[] {
  const allowlist = ALLOWLISTS.get(element.namespaceURI);
  if (allowlist === undefined || !allowlist.elements.has(element.tagName)) {
    return [`a ${allowlist?.label ?? ""}<${element.tagName}> element`];
  }
  const own = attributeRefusals(allowlist, element);
  if (element.tagName === "style") {
    const elements = elementChildren(element);
    return [
      ...own,
      ...(elements.length > 0 ? ["an element inside a <style>"] : []),
      ...cssRefusals(textOf(element)),
    ];
  }
  return [...own, ...elementChildren(element).flatMap(treeRefusals)];
}

function withoutComments(node: ParentNode): void {
  node.childNodes = node.childNodes.filter(
    (childNode: Node) => !defaultTreeAdapter.isCommentNode(childNode),
  );
  for (const element of elementChildren(node)) withoutComments(element);
}

/** A sketch's markup as checked: what it holds that a sketch may not, and the body it writes back. */
interface ReadMarkup {
  refusals: string[];
  body: string;
}

/**
 * How deep a sketch may nest elements. Browsers stop nesting at 512 levels
 * and parse5 does not, and the walks below and parse5's serializer recurse,
 * so a deeper tree is refused before either reads it.
 */
const MAX_DEPTH = 256;

/**
 * How many tags a sketch may write, start and end tags alike, since a stray
 * `</p>` also makes an element. parse5's time grows with the square of the
 * elements tags can keep open, so the count is bounded before it parses.
 */
const MAX_TAGS = 4096;
/**
 * How many elements one parse may build. A tag builds at most one, but parse5
 * rebuilds every open formatting element (`<b>`, `<a>`, `<font>` and the like)
 * after a block closes them, and the adoption agency and foster parenting
 * build more, so a few thousand tags could build millions of elements. The
 * scaffold of the frame document adds three.
 */
const MAX_ELEMENTS = 2 * MAX_TAGS + 3;
/** How many characters of attribute names and values one parse may build, copies included. */
const MAX_ATTRIBUTE_CHARACTERS = 2 * SKETCH_MAX_SOURCE;
/** How long the written-back body may be before it is parsed again. */
const MAX_WRITTEN = 2 * SKETCH_MAX_SOURCE;
/** How many attributes one tag may hold. parse5's time on a tag grows with the square of its attributes. */
const MAX_ATTRIBUTES = 64;
/** What opens a tag in HTML: `<` or `</`, then an ASCII letter. */
const TAG_OPEN = /<\/?[a-zA-Z]/g;

function moreTagsThan(markup: string, limit: number): boolean {
  TAG_OPEN.lastIndex = 0;
  let count = 0;
  while (TAG_OPEN.exec(markup) !== null) {
    count += 1;
    if (count > limit) return true;
  }
  return false;
}

function deeperThan(root: ParentNode, limit: number): boolean {
  const pending: Array<readonly [ParentNode, number]> = [[root, 0]];
  for (let entry = pending.pop(); entry !== undefined; entry = pending.pop()) {
    const [node, depth] = entry;
    if (depth > limit) return true;
    for (const element of elementChildren(node))
      pending.push([element, depth + 1]);
  }
  return false;
}

function readMarkup(markup: string): ReadMarkup {
  if (moreTagsThan(markup, MAX_TAGS)) {
    return { refusals: [`more than ${MAX_TAGS} tags`], body: "" };
  }
  if (moreAttributesThan(markup, MAX_ATTRIBUTES)) {
    return {
      refusals: [`a tag with more than ${MAX_ATTRIBUTES} attributes`],
      body: "",
    };
  }
  const parsed = frameDocument("", markup);
  if (!parsed.ok) return { refusals: [parsed.refusal], body: "" };
  const { document } = parsed;
  const root = child(document, "html");
  const head = root && child(root, "head");
  const body = root && child(root, "body");
  if (root === undefined || head === undefined || body === undefined) {
    return { refusals: ["markup the frame does not read as a body"], body: "" };
  }
  if (deeperThan(body, MAX_DEPTH)) {
    return {
      refusals: [`elements nested more than ${MAX_DEPTH} levels deep`],
      body: "",
    };
  }
  const scaffold =
    [root, head, body].some((element) => element.attrs.length > 0) ||
    head.childNodes.length > 0 ||
    elementChildren(root).length !== 2 ||
    elementChildren(document).length !== 1;
  const refusals = [
    ...(scaffold ? ["an <html>, <head> or <body> tag"] : []),
    ...elementChildren(body).flatMap(treeRefusals),
  ];
  if (refusals.length > 0) return { refusals, body: "" };
  withoutComments(body);
  const written = serialize(body);
  return written.length > MAX_WRITTEN
    ? {
        refusals: [
          `markup that writes back longer than ${MAX_WRITTEN} characters`,
        ],
        body: "",
      }
    : { refusals, body: written };
}

/**
 * What a sketch's `html` holds that a sketch may not, and the markup to draw
 * in its place: the tree the check read, written back. Markup that the parser
 * would read differently once written back is refused, so the frame draws the
 * tree that was checked.
 */
export function checkMarkup(markup: string): ReadMarkup {
  const first = readMarkup(markup);
  if (first.refusals.length > 0)
    return { refusals: [...new Set(first.refusals)], body: "" };
  const second = readMarkup(first.body);
  return second.refusals.length > 0 || second.body !== first.body
    ? {
        refusals: ["markup the parser reads differently once written back"],
        body: "",
      }
    : first;
}

/**
 * Whether `css` stays one `<style>` element's text in the frame's head, so it
 * cannot end that element early. A `</style` anywhere is refused before any
 * parse, so parse5 then reads `css` only as raw text, in linear time.
 */
export function staysInStyle(css: string): boolean {
  if (/<\/style/i.test(css)) return false;
  const parsed = frameDocument(`<style>${css}</style>`, "");
  const root = parsed.ok ? child(parsed.document, "html") : undefined;
  const head = root && child(root, "head");
  const styles = head ? elementChildren(head) : [];
  return (
    styles.length === 1 &&
    styles[0]?.tagName === "style" &&
    styles[0].namespaceURI === html.NS.HTML &&
    textOf(styles[0]) === css
  );
}
