import createDOMPurify, {
  type DOMPurify,
  type RemovedAttribute,
  type RemovedElement,
} from "dompurify";
import type { JSDOM } from "jsdom";
import { isIndexable } from "./guards";

export interface SanitizedSvg {
  svg: string;
  hadActiveContent: boolean;
  /** Set when nothing is left, or the result is not one well-formed `<svg>`. */
  invalidReason?: string;
}

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const SVG_TYPE = "image/svg+xml";
const HREF_ATTRIBUTE = /^(?:xlink:)?href$/;
const INTERNAL_REFERENCE = "#";

/**
 * The elements that may embed a bitmap as a `data:` URL, and the formats
 * allowed: exported logos often embed their raster parts this way, and such
 * an image fetches nothing.
 */
const BITMAP_ELEMENTS = new Set(["image", "feimage"]);
const EMBEDDED_BITMAP = /^data:image\/(?:png|jpeg|gif|webp)[;,]/i;

/**
 * What CSS fetches a resource with: `url()` except `url(#…)` (a reference
 * inside the file), `image-set()` and `src()`. Each is replaced with `none`,
 * which paint, filter, clip, mask and marker properties all accept.
 * `(?=(\s*))\1` consumes the spaces after `url(` atomically, so backtracking
 * cannot give some back and mistake `url( #…)` for an outside reference.
 */
const OUTSIDE_RESOURCE =
  /(?:-webkit-)?image-set\([^)]*\)|src\([^)]*\)|url\((?=(\s*))\1(?!['"]?#)[^)]*\)/gi;
const IMPORT_RULE = /@import[^;]*;?/gi;
const NO_RESOURCE = "none";
const CSS_ESCAPE = "\\";
const RESOURCE_SYNTAX_CHARACTERS = /[(@]/;

/**
 * Nodes DOMPurify reports as removed that were never logo content: the
 * `html`, `head` and `body` the HTML parser wraps the SVG in, and comments
 * (an XML declaration parses as one).
 */
const NON_CONTENT_NODES = new Set(["HTML", "HEAD", "BODY", "#comment"]);

/**
 * The SVG elements DOMPurify removes that neither run nor fetch anything:
 * paint servers and font parts no browser draws, and metadata. Drawing tools'
 * own elements (Inkscape, Sodipodi, Illustrator) are recognized by their
 * namespace prefix instead.
 */
const INERT_ELEMENTS = new Set([
  "discard",
  "font-face",
  "font-face-format",
  "font-face-name",
  "font-face-src",
  "hatch",
  "hatchpath",
  "mesh",
  "meshgradient",
  "meshpatch",
  "meshrow",
  "metadata",
  "missing-glyph",
  "solidcolor",
  "unknown",
]);

/**
 * Attributes whose removal always warrants a warning, as event handlers do:
 * those naming a document, and `style`. Any other removed attribute warrants
 * one only when its value matches `ACTIVE_VALUE`.
 */
const ACTIVE_ATTRIBUTES = new Set([
  "href",
  "xlink:href",
  "xml:base",
  "src",
  "style",
]);
const EVENT_HANDLER = /^on/i;
const ACTIVE_VALUE = /url\(|image-set\(|src\(|@import|javascript:|data:/i;

/**
 * DOMPurify serializes a no-break space as `&nbsp;`, an entity XML does not
 * define: the SVG would fail to load as an image.
 */
const NAMED_NO_BREAK_SPACE = /&nbsp;/g;
const NUMERIC_NO_BREAK_SPACE = "&#160;";

interface SvgSanitizer {
  purify: DOMPurify;
  window: JSDOM["window"];
  /** Reset at each `sanitizeSvg` call. */
  hasHookRemovedContent: boolean;
}

let cachedSanitizer: SvgSanitizer | undefined;

/**
 * Undefined when the CSS holds a backslash and a `(` or `@`: an escape could
 * spell a reference the patterns miss (`\75 rl(`), so the caller drops it
 * all. Repeats until nothing changes, so that a removal cannot join the text
 * around it into a new reference.
 */
function withoutOutsideResources(css: string): string | undefined {
  if (css.includes(CSS_ESCAPE) && RESOURCE_SYNTAX_CHARACTERS.test(css)) {
    return undefined;
  }
  let cleanedCss = css;
  let previousCss: string;
  do {
    previousCss = cleanedCss;
    cleanedCss = previousCss
      .replace(IMPORT_RULE, "")
      .replace(OUTSIDE_RESOURCE, NO_RESOURCE);
  } while (cleanedCss !== previousCss);
  return cleanedCss;
}

function isAllowedReference(element: Element, value: string): boolean {
  return (
    value.startsWith(INTERNAL_REFERENCE) ||
    (BITMAP_ELEMENTS.has(element.nodeName.toLowerCase()) &&
      EMBEDDED_BITMAP.test(value))
  );
}

/**
 * Hooks that remove what DOMPurify's SVG profile allows but a logo never
 * needs: an `href` that does not point inside the file, except a bitmap
 * `data:` URL on `<image>` or `<feImage>` (so `<use>`, which logo exports use
 * to reuse shapes, can only point inside the file); and every resource CSS
 * fetches, in an attribute, a `style` or a `<style>` sheet (where Illustrator
 * writes its class rules). A last hook adds a missing `xmlns`.
 */
/**
 * A browser loads an SVG file as XML, which needs `xmlns`; an SVG copied out
 * of an HTML page often lacks it.
 */
function addNamespace(node: Element): void {
  if (
    node.nodeName.toLowerCase() === "svg" &&
    !node.parentElement?.closest("svg") &&
    !node.hasAttribute("xmlns")
  ) {
    node.setAttribute("xmlns", SVG_NAMESPACE);
  }
}

function addHooks(sanitizer: SvgSanitizer): void {
  sanitizer.purify.addHook("uponSanitizeAttribute", (node, data) => {
    if (HREF_ATTRIBUTE.test(data.attrName)) {
      if (!isAllowedReference(node, data.attrValue)) {
        data.keepAttr = false;
        sanitizer.hasHookRemovedContent = true;
      }
      return;
    }
    const cleanedCss = withoutOutsideResources(data.attrValue);
    if (cleanedCss === data.attrValue) {
      return;
    }
    sanitizer.hasHookRemovedContent = true;
    if (cleanedCss === undefined || cleanedCss.trim() === "") {
      data.keepAttr = false;
    } else {
      data.attrValue = cleanedCss;
    }
  });
  sanitizer.purify.addHook("uponSanitizeElement", (node, data) => {
    if (data.tagName !== "style") {
      return;
    }
    const css = node.textContent ?? "";
    const cleanedCss = withoutOutsideResources(css) ?? "";
    if (cleanedCss !== css) {
      node.textContent = cleanedCss;
      sanitizer.hasHookRemovedContent = true;
    }
  });
  sanitizer.purify.addHook("afterSanitizeAttributes", addNamespace);
}

/**
 * Created on first use, jsdom included: loading jsdom takes a few hundred
 * milliseconds and about a hundred megabytes, which a process that never
 * handles a logo (production, or the builder off) should not pay.
 */
function isJsdomModule(value: unknown): value is { JSDOM: typeof JSDOM } {
  return isIndexable(value) && typeof value.JSDOM === "function";
}

function svgSanitizer(): SvgSanitizer {
  if (cachedSanitizer) {
    return cachedSanitizer;
  }
  const loaded: unknown = require("jsdom");
  if (!isJsdomModule(loaded)) {
    throw new TypeError("jsdom does not export JSDOM");
  }
  const { window } = new loaded.JSDOM("");
  const sanitizer: SvgSanitizer = {
    purify: createDOMPurify(window),
    window,
    hasHookRemovedContent: false,
  };
  addHooks(sanitizer);
  cachedSanitizer = sanitizer;
  return sanitizer;
}

function isEditorData(name: string): boolean {
  const prefix = name.split(":")[0] ?? "";
  return name.includes(":") && prefix !== "xlink" && prefix !== "xml";
}

function isActiveElement(entry: RemovedElement): boolean {
  const name = entry.element.nodeName;
  return !(
    NON_CONTENT_NODES.has(name) ||
    isEditorData(name) ||
    INERT_ELEMENTS.has(name.toLowerCase())
  );
}

function isActiveAttribute(entry: RemovedAttribute): boolean {
  if (!entry.attribute) {
    return true;
  }
  const { name, value } = entry.attribute;
  return (
    EVENT_HANDLER.test(name) ||
    ACTIVE_ATTRIBUTES.has(name.toLowerCase()) ||
    ACTIVE_VALUE.test(value)
  );
}

/**
 * What drawing tools leave in their exports (`<metadata>`,
 * `sodipodi:namedview`, `inkscape:label`) is no reason to warn the author.
 */
function hasRemovedActiveContent(removed: DOMPurify["removed"]): boolean {
  return removed.some((entry) =>
    "element" in entry ? isActiveElement(entry) : isActiveAttribute(entry),
  );
}

/**
 * DOMPurify parses as HTML, which accepts what an SVG file read as XML
 * rejects: a page around the SVG, two SVGs side by side, or entities declared
 * in an Illustrator DOCTYPE. Saved as is, each would be a broken logo with no
 * error.
 */
function invalidSvgReason(
  window: SvgSanitizer["window"],
  svg: string,
): string | undefined {
  if (svg.trim() === "") {
    return "nothing of the SVG is left once its scripts and outside references are taken out";
  }
  const document = new window.DOMParser().parseFromString(svg, SVG_TYPE);
  const root = document.documentElement;
  return root.namespaceURI === SVG_NAMESPACE &&
    root.localName === "svg" &&
    document.getElementsByTagName("parsererror").length === 0
    ? undefined
    : "the file is not one well-formed <svg> image (an HTML page, several images, or the entities of an Illustrator DOCTYPE): export it again as a plain SVG";
}

/**
 * Removes everything in an SVG logo that could run or fetch: scripts, event
 * handlers, `javascript:` links, embedded documents, and links or CSS
 * references to other files. The logo is served from the dashboard's own
 * origin, so a script in it would run there when the file is opened directly.
 * The result is then checked to be one well-formed SVG.
 */
export function sanitizeSvg(text: string): SanitizedSvg {
  const sanitizer = svgSanitizer();
  sanitizer.hasHookRemovedContent = false;
  const svg = sanitizer.purify
    .sanitize(text, {
      USE_PROFILES: { svg: true, svgFilters: true },
      ADD_TAGS: ["use"],
      ADD_DATA_URI_TAGS: ["feimage"],
    })
    .replace(NAMED_NO_BREAK_SPACE, NUMERIC_NO_BREAK_SPACE);
  const hadActiveContent =
    sanitizer.hasHookRemovedContent ||
    hasRemovedActiveContent(sanitizer.purify.removed);
  const invalidReason = invalidSvgReason(sanitizer.window, svg);
  return invalidReason
    ? { svg, hadActiveContent, invalidReason }
    : { svg, hadActiveContent };
}
