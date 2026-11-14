import { expect } from "chai";
import {
  type DefaultTreeAdapterTypes,
  defaultTreeAdapter,
  parse,
} from "parse5";
import { z } from "zod";
import type * as Tokenizer from "@csstools/css-tokenizer" with {
  "resolution-mode": "import",
};
import { checkSketch, type SketchSource } from "../../../mockup/sketch";

type Element = DefaultTreeAdapterTypes.Element;
type CSSToken = Tokenizer.CSSToken;
/** A function a module exports, whatever its signature: the schema below names the signature. */
type Exported = (...args: never[]) => void;

function isFunction(value: unknown): value is Exported {
  return typeof value === "function";
}

function exported<Name extends keyof typeof Tokenizer>() {
  return z.custom<(typeof Tokenizer)[Name]>(isFunction);
}

/** The tokenizer's CommonJS build, loaded apart from the check under test and parsed against its declarations. */
const OracleTokenizerSchema = z.object({
  tokenize: exported<"tokenize">(),
  isTokenAtKeyword: exported<"isTokenAtKeyword">(),
  isTokenBadString: exported<"isTokenBadString">(),
  isTokenBadURL: exported<"isTokenBadURL">(),
  isTokenCloseCurly: exported<"isTokenCloseCurly">(),
  isTokenCloseParen: exported<"isTokenCloseParen">(),
  isTokenCloseSquare: exported<"isTokenCloseSquare">(),
  isTokenFunction: exported<"isTokenFunction">(),
  isTokenOpenCurly: exported<"isTokenOpenCurly">(),
  isTokenOpenParen: exported<"isTokenOpenParen">(),
  isTokenOpenSquare: exported<"isTokenOpenSquare">(),
  isTokenString: exported<"isTokenString">(),
  isTokenURL: exported<"isTokenURL">(),
  isTokenWhiteSpaceOrComment: exported<"isTokenWhiteSpaceOrComment">(),
});

const {
  isTokenAtKeyword,
  isTokenBadString,
  isTokenBadURL,
  isTokenCloseCurly,
  isTokenCloseParen,
  isTokenCloseSquare,
  isTokenFunction,
  isTokenOpenCurly,
  isTokenOpenParen,
  isTokenOpenSquare,
  isTokenString,
  isTokenURL,
  isTokenWhiteSpaceOrComment,
  tokenize,
} = OracleTokenizerSchema.parse(require("@csstools/css-tokenizer"));

const HTML_INPUTS = 3000;
const CSS_INPUTS = 500;
const SEED = 0x5ce7c4;
const DIFFERENTIAL_TIMEOUT_MS = 60_000;

const SEPARATORS = [
  " ",
  "\t",
  "\n",
  "\f",
  "\r",
  "\v",
  " ",
  "/",
  "\u0000",
  " ",
  "﻿",
  "",
];
const TAGS = [
  "a",
  "A",
  "area",
  "img",
  "IMG",
  "svg:a",
  "image",
  "iframe",
  "meta",
  "base",
  "form",
  "button",
  "script",
  "object",
  "embed",
  "link",
  "input",
];
const ATTRIBUTES = [
  "href",
  "HREF",
  "xlink:href",
  "src",
  "srcset",
  "formaction",
  "action",
  "onclick",
  "onerror",
  "ONLOAD",
  "style",
  "title",
  "data",
  "poster",
  "ping",
  "http-equiv",
];
const ASSIGNMENTS = ["=", " = ", "=\v", "\v=", "= ", "\t=\t", "\n=\n"];
const QUOTES = ["", '"', "'", "`"];
const VALUES = [
  "https://example.com/x",
  "//example.com/x",
  "java&#115;cript:alert(1)",
  "&#104;ttps://example.com/x",
  "&#x68;ttps&colon;//example.com/x",
  "\u0000https://example.com/x",
  "ht\ttps://example.com/x",
  " #a",
  "#a",
  "data:image/png;base64,AAAA",
  "data:text/html,<a>",
  "background:url(https://example.com/x)",
  "background:\\75rl(https://example.com/x)",
  "background:u\\72l(https://example.com/x)",
  "background:image-set('https://example.com/x' 1x)",
  "background:u&#114;l(https://example.com/x)",
  "background:url(#a)",
  "color:red",
];
const JUNK = [
  'title=x"y',
  "x'y",
  'x"',
  "title=\v'",
  'title=">"',
  "",
  "a=b=c",
  "title=`x`",
];
const WRAPPERS: ReadonlyArray<readonly [string, string]> = [
  ["", ""],
  ["<!--", "-->"],
  ["<!-->", ""],
  ["<svg>", "</svg>"],
  ["<math>", "</math>"],
  ["<svg><![CDATA[", "]]></svg>"],
  ["<textarea>", "</textarea>"],
  ["<title>", "</title>"],
  ["<xmp>", "</xmp>"],
  ["<noscript>", "</noscript>"],
  ["<plaintext>", ""],
  ["<noembed>", "</noembed>"],
  ["<template>", "</template>"],
  ["<style>", "</style>"],
  ["<svg><style>", "</style></svg>"],
  ["<table>", "</table>"],
  ["<p>", ""],
  ["<svg><foreignObject>", "</foreignObject></svg>"],
  ["<math><mtext>", "</mtext></math>"],
];
const CSS_TEMPLATES = [
  (value: string) => `p{background:url(${value})}`,
  (value: string) => `p{background:\\75rl(${value})}`,
  (value: string) => `p{background:\\75\r\nrl(${value})}`,
  (value: string) => `@\\69mport '${value}';`,
  (value: string) => `p{background:image-set("${value}" 1x)}`,
  (value: string) => `p{background:image-set("ht\\\n${value}" 1x)}`,
  (value: string) => `</style><a href="${value}">x</a>`,
  (value: string) => `p{}</STYLE\t><img src="${value}">`,
  (value: string) => `p{content:"${value}"}`,
  (value: string) => `p{b:url("#x\n);background:url(${value});c:"}`,
  (value: string) => `p{b:url(\\22 ${value}\\22 )}`,
  () => "p{background:url(\\22 #a\\22 )}",
  (value: string) => `p{--x:"${value}";background:image-set(var(--x) 1x)}`,
];

/** A seeded mulberry32, so a failure replays. */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 2 ** 32;
  };
}

type Picker = <T>(items: readonly T[]) => T;

function picker(next: () => number): Picker {
  return (items) => {
    const item = items[Math.floor(next() * items.length)];
    if (item === undefined) throw new Error("picked from an empty list");
    return item;
  };
}

function generatedHtml(pick: Picker, next: () => number): string {
  const tag = pick(TAGS);
  const quote = pick(QUOTES);
  const attribute = `${pick(ATTRIBUTES)}${pick(ASSIGNMENTS)}${quote}${pick(VALUES)}${next() < 0.15 ? "" : quote}`;
  const duplicate =
    next() < 0.2
      ? `${pick(SEPARATORS)}${pick(ATTRIBUTES)}=${pick(VALUES)}`
      : "";
  const close = next() < 0.1 ? "" : ">";
  const [open, end] = pick(WRAPPERS);
  return `${open}<${tag}${pick(SEPARATORS)}${pick(JUNK)}${pick(SEPARATORS)}${attribute}${duplicate}${close}x</${tag}>${end}`;
}

const DANGEROUS_ELEMENTS =
  /^(?:script|iframe|frame|frameset|object|embed|applet|portal|link|base|meta|form|set|animate.*|foreignobject|noscript|template)$/i;
const URL_ATTRIBUTES =
  /^(?:href|src|srcset|action|formaction|poster|data|background|ping|cite|longdesc|usemap|codebase|manifest|lowsrc|dynsrc)$/i;

/** A URL as a browser reads it, written apart from the check under test. */
function oracleUrl(value: string): string {
  return value
    .replace(/[\t\n\r]/g, "")
    .replace(/^[^!-\uffff]+|[^!-\uffff]+$/g, "");
}

function oracleLocal(value: string): boolean {
  const url = oracleUrl(value);
  return url.startsWith("#") || /^data:image\//i.test(url);
}

const LOADERS = new Set(["url", "src", "image", "image-set", "cross-fade"]);

function oracleName(token: CSSToken): string {
  return isTokenFunction(token)
    ? token[4].value.toLowerCase().replace(/^-(?:webkit|moz|ms|o)-/, "")
    : "";
}

/** Whether an opened url() or src() reads its URL from a token other than a local string. */
function badFirstArgument(
  token: CSSToken,
  opened: string | undefined,
): boolean {
  if (opened !== "url" && opened !== "src") return false;
  return !isTokenString(token) || !oracleLocal(token[4].value);
}

/** What a browser would load from `css`, read by a CSS tokenizer, written apart from the check under test. */
function oracleCss(css: string): string | undefined {
  const open: string[] = [];
  let awaiting: string | undefined;
  for (const token of tokenize({ css })) {
    if (isTokenWhiteSpaceOrComment(token)) continue;
    if (isTokenBadString(token) || isTokenBadURL(token))
      return "a broken string or url";
    if (isTokenAtKeyword(token) && token[4].value.toLowerCase() === "import")
      return "an @import";
    if (isTokenURL(token) && !oracleLocal(token[4].value))
      return `url(${token[4].value})`;
    if (badFirstArgument(token, awaiting))
      return `${awaiting}() reading ${token[1]}`;
    awaiting = undefined;
    const loaded = open.some((name) => LOADERS.has(name));
    if (isTokenString(token) && loaded && !oracleLocal(token[4].value))
      return `a loaded string ${token[4].value}`;
    if (isTokenFunction(token)) {
      open.push(oracleName(token));
      awaiting = oracleName(token);
    } else if (
      isTokenOpenParen(token) ||
      isTokenOpenSquare(token) ||
      isTokenOpenCurly(token)
    ) {
      open.push("");
    } else if (
      isTokenCloseParen(token) ||
      isTokenCloseSquare(token) ||
      isTokenCloseCurly(token)
    ) {
      open.pop();
    }
  }
  return undefined;
}

function elementsOf(node: DefaultTreeAdapterTypes.ParentNode): Element[] {
  return node.childNodes
    .filter((childNode): childNode is Element =>
      defaultTreeAdapter.isElementNode(childNode),
    )
    .flatMap((element) => [element, ...elementsOf(element)]);
}

/** What a browser would find in the drawn sketch that a sketch may not hold, read by parse5. */
function unsafeIn(sketch: SketchSource): string | undefined {
  const document = parse(
    `<!doctype html><html><head><style>${sketch.css ?? ""}</style></head><body>${sketch.html}</body></html>`,
    { scriptingEnabled: false },
  );
  const elements = elementsOf(document);
  const head = elements.find((element) => element.tagName === "head");
  const headStyles = head === undefined ? [] : elementsOf(head);
  if (headStyles.length !== 1)
    return "markup that leaves the sketch's style element";
  for (const element of elements) {
    if (DANGEROUS_ELEMENTS.test(element.tagName))
      return `a <${element.tagName}>`;
    if (element.tagName === "style" && !headStyles.includes(element)) {
      const text = element.childNodes
        .map((node) => (defaultTreeAdapter.isTextNode(node) ? node.value : ""))
        .join("");
      const css = oracleCss(text);
      if (css !== undefined) return css;
    }
    for (const attribute of element.attrs) {
      if (/^on/i.test(attribute.name)) return `an ${attribute.name}`;
      if (URL_ATTRIBUTES.test(attribute.name) && !oracleLocal(attribute.value))
        return `${attribute.name}=${attribute.value}`;
      const css =
        attribute.name === "style" ||
        element.namespaceURI !== "http://www.w3.org/1999/xhtml"
          ? oracleCss(attribute.value)
          : undefined;
      if (css !== undefined) return css;
    }
  }
  return oracleCss(sketch.css ?? "");
}

function generatedSketches(): SketchSource[] {
  const next = random(SEED);
  const pick = picker(next);
  const sketches: SketchSource[] = Array.from({ length: HTML_INPUTS }, () => ({
    html: generatedHtml(pick, next),
  }));
  for (let index = 0; index < CSS_INPUTS; index += 1) {
    sketches.push({ html: "<p>x</p>", css: pick(CSS_TEMPLATES)(pick(VALUES)) });
  }
  return sketches;
}

describe("Sketch check against an HTML parser", function () {
  this.timeout(DIFFERENTIAL_TIMEOUT_MS);

  it("draws nothing a browser would read as a link out, a load, a handler or a forbidden element", () => {
    const accepted = generatedSketches().flatMap((source) => {
      const checked = checkSketch(source);
      return checked.ok ? [{ source, drawn: checked.sketch }] : [];
    });
    const unsafe = accepted.flatMap(({ source, drawn }) => {
      const found = unsafeIn(drawn);
      return found === undefined ? [] : [{ source, found }];
    });

    expect(unsafe).to.deep.equal([]);
    expect(accepted.length).to.be.greaterThan(HTML_INPUTS / 20);
  });

  it("draws the markup it checked, written back from the parsed tree", () => {
    const checked = checkSketch({
      html: "<p>a<b>bold<!-- note --></p><img src=data:image/png;base64,AAAA>",
    });

    expect(checked).to.deep.equal({
      ok: true,
      sketch: {
        html: '<p>a<b>bold</b></p><b><img src="data:image/png;base64,AAAA"></b>',
      },
    });
  });

  it("refuses css that ends its style element early", () => {
    const checked = checkSketch({ html: "<p>x</p>", css: "p{}</style><p>y" });

    expect(checked.ok).to.equal(false);
  });
});
