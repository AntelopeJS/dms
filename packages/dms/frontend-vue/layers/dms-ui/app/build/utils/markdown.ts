// What the Prose block reads its Markdown into. `marked` only tokenizes here:
// the block draws the tokens as Vue nodes itself, so no HTML string is ever
// produced or injected, raw HTML in the source is dropped, and every link and
// image address is checked before it reaches an attribute. The parse is
// synchronous and runs the same on the server and in the browser, so the
// hydrated page draws what the server sent.

import { decodeHTML } from "entities";
import { Lexer, type Token, type Tokens } from "marked";
import { type LinkKind, linkKind } from "./link";

/** A heading of the text, as the table of contents lists it. */
export interface ProseHeading {
  id: string;
  /** 2, 3 or 4: the level the heading is drawn at. */
  level: ProseHeadingLevel;
  text: string;
}

export type ProseHeadingLevel = 2 | 3 | 4;

/** How a link of the text is followed: see {@link proseLinkKind}. */
export type ProseLinkKind = LinkKind | "contact";

/** The GitHub alert kinds a quote turns into a callout with. */
export type ProseCalloutKind =
  | "note"
  | "tip"
  | "important"
  | "warning"
  | "caution";

/** A heading token, with the anchor the parse gave it. */
export interface ProseHeadingToken extends Tokens.Heading {
  id: string;
  level: ProseHeadingLevel;
}

/** A quote opening with `[!KIND]`, its marker taken out. */
export interface ProseCalloutToken extends Tokens.Blockquote {
  callout: ProseCalloutKind;
}

/** Markdown read into tokens, with the headings the table of contents lists. */
export interface ParsedProse {
  tokens: Token[];
  headings: ProseHeading[];
}

const LEXER_OPTIONS = { gfm: true, breaks: false } as const;

const MIN_HEADING_LEVEL = 2;
const MAX_HEADING_LEVEL = 4;
// The headings the table of contents lists: the deeper ones only structure a
// section.
const TOC_MAX_LEVEL = 3;

const CALLOUT_MARKER =
  /^\[!(note|tip|important|warning|caution)\][ \t]*(?:\n|$)/i;

const SCHEME_PATTERN = /^([a-z][a-z\d+.-]*):/i;
const SAFE_LINK_SCHEMES = new Set(["http", "https", "mailto", "tel"]);
const SAFE_IMAGE_SCHEMES = new Set(["http", "https"]);
const CONTACT_LINK_PATTERN = /^(?:mailto|tel):/i;
// Characters a browser ignores inside a URL scheme (`java\tscript:`).
const SPACE_CODE = 0x20;
const DELETE_CODE = 0x7f;
const LAST_C1_CODE = 0x9f;

/** Drops the control characters and spaces a browser ignores in a URL. */
function stripIgnoredCharacters(url: string): string {
  return [...url]
    .filter((character) => {
      const code = character.codePointAt(0)!;
      return code > SPACE_CODE && (code < DELETE_CODE || code > LAST_C1_CODE);
    })
    .join("");
}

/**
 * Whether an address may become a link: `http(s)`, `mailto:`, `tel:`, a path
 * or an `#anchor`. Anything else (`javascript:`, `data:`, `vbscript:`) is
 * refused, entities and ignored characters decoded first.
 */
export function isSafeLinkUrl(href: string): boolean {
  return hasSafeScheme(href, SAFE_LINK_SCHEMES);
}

/** Whether an address may be an image's source: `http(s)` or a path. */
export function isSafeImageUrl(src: string): boolean {
  return hasSafeScheme(src, SAFE_IMAGE_SCHEMES);
}

function hasSafeScheme(url: string, schemes: Set<string>): boolean {
  const normalized = stripIgnoredCharacters(decodeHTML(url));
  if (!normalized) return false;
  const scheme = SCHEME_PATTERN.exec(normalized)?.[1];
  return !scheme || schemes.has(scheme.toLowerCase());
}

/**
 * How a link is followed: a DMS route in place, an `#anchor` on the page, a
 * `mailto:` / `tel:` address by the system, another site in a new tab.
 * Nothing for an address {@link isSafeLinkUrl} refuses: the text stays.
 */
export function proseLinkKind(href: string): ProseLinkKind | undefined {
  if (!isSafeLinkUrl(href)) return undefined;
  if (CONTACT_LINK_PATTERN.test(href.trim())) return "contact";
  return linkKind(href);
}

/** A token's text without its Markdown: what a heading reads as. */
export function plainText(tokens: Token[] | undefined): string {
  return (tokens ?? [])
    .map((token) => {
      if ("tokens" in token && token.tokens) return plainText(token.tokens);
      if (token.type === "html" || token.type === "checkbox") return "";
      return "text" in token ? decodeHTML(String(token.text)) : "";
    })
    .join("");
}

/**
 * The anchor of a heading: lower case, accents dropped, words joined by
 * dashes ("Les accès" → `les-acces`).
 */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\d]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const SECTION_FALLBACK_SLUG = "section";

function clampLevel(depth: number): ProseHeadingLevel {
  return Math.min(
    MAX_HEADING_LEVEL,
    Math.max(MIN_HEADING_LEVEL, depth),
  ) as ProseHeadingLevel;
}

function calloutOf(token: Tokens.Blockquote): ProseCalloutToken | undefined {
  const marker = CALLOUT_MARKER.exec(token.text);
  if (!marker?.[1]) return undefined;
  return {
    ...token,
    callout: marker[1].toLowerCase() as ProseCalloutKind,
    tokens: new Lexer(LEXER_OPTIONS).lex(token.text.slice(marker[0].length)),
  };
}

/**
 * Reads Markdown into tokens: headings get a unique anchor and are clamped
 * to levels 2 – 4 (a `#` heading is drawn as a `##`, the page already has
 * its title), and `> [!KIND]` quotes become callouts.
 */
export function parseProse(markdown: string): ParsedProse {
  const headings: ProseHeading[] = [];
  const usedIds = new Map<string, number>();

  function uniqueId(text: string): string {
    const base = slugify(text) || SECTION_FALLBACK_SLUG;
    const count = usedIds.get(base) ?? 0;
    usedIds.set(base, count + 1);
    return count ? `${base}-${count + 1}` : base;
  }

  function visit(tokens: Token[]): Token[] {
    return tokens.map((token) => {
      if (token.type === "heading") {
        const heading = token as Tokens.Heading;
        const text = plainText(heading.tokens);
        const level = clampLevel(heading.depth);
        const id = uniqueId(text);
        if (level <= TOC_MAX_LEVEL) headings.push({ id, level, text });
        return { ...heading, id, level } satisfies ProseHeadingToken;
      }
      if (token.type === "blockquote") {
        const quote = calloutOf(token as Tokens.Blockquote) ?? token;
        return { ...quote, tokens: visit(quote.tokens ?? []) } as Token;
      }
      return token;
    });
  }

  const tokens = visit(new Lexer(LEXER_OPTIONS).lex(markdown));
  return { tokens, headings };
}

/**
 * The text of a per-locale map for the reader: their locale, then one of the
 * same language (`fr-BE` reads `fr-FR`), then the fallback locale, then the
 * first text given.
 */
export function pickLocaleText(
  texts: Record<string, string>,
  locale: string,
  fallbackLocale?: string,
): string {
  const language = locale.split("-")[0]?.toLowerCase();
  const sameLanguage = Object.keys(texts).find(
    (key) => key.split("-")[0]?.toLowerCase() === language,
  );
  const key = [locale, sameLanguage, fallbackLocale].find(
    (candidate) => candidate && texts[candidate] !== undefined,
  );
  return key ? texts[key]! : (Object.values(texts)[0] ?? "");
}
