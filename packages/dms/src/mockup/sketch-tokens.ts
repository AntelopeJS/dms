import { z } from "zod";
import type * as Tokenizer from "@csstools/css-tokenizer" with {
  "resolution-mode": "import",
};

/** A CSS token, as the CSS Syntax spec's tokenizer reads it. */
export type CSSToken = Tokenizer.CSSToken;

/** A function a module exports, whatever its signature: the schema below names the signature. */
type Exported = (...args: never[]) => void;

function isFunction(value: unknown): value is Exported {
  return typeof value === "function";
}

/** One export of `@csstools/css-tokenizer`, typed from the package's own declarations. */
function exported<Name extends keyof typeof Tokenizer>() {
  return z.custom<(typeof Tokenizer)[Name]>(isFunction);
}

/** The exports of `@csstools/css-tokenizer` the sketch check reads. */
const CssTokenizerSchema = z.object({
  tokenize: exported<"tokenize">(),
  isTokenAtKeyword: exported<"isTokenAtKeyword">(),
  isTokenBadString: exported<"isTokenBadString">(),
  isTokenBadURL: exported<"isTokenBadURL">(),
  isTokenCloseCurly: exported<"isTokenCloseCurly">(),
  isTokenCloseParen: exported<"isTokenCloseParen">(),
  isTokenCloseSquare: exported<"isTokenCloseSquare">(),
  isTokenDelim: exported<"isTokenDelim">(),
  isTokenFunction: exported<"isTokenFunction">(),
  isTokenIdent: exported<"isTokenIdent">(),
  isTokenOpenCurly: exported<"isTokenOpenCurly">(),
  isTokenOpenParen: exported<"isTokenOpenParen">(),
  isTokenOpenSquare: exported<"isTokenOpenSquare">(),
  isTokenString: exported<"isTokenString">(),
  isTokenURL: exported<"isTokenURL">(),
  isTokenWhiteSpaceOrComment: exported<"isTokenWhiteSpaceOrComment">(),
});

/**
 * The CSS tokenizer the sketch check reads CSS with. `@csstools/css-tokenizer`
 * 3 ships a CommonJS build, which this CommonJS module loads so it runs on
 * every Node the package admits, but publishes declarations for its ES module
 * build only, so its CommonJS exports are parsed against those declarations.
 */
export const cssTokenizer = CssTokenizerSchema.parse(
  require("@csstools/css-tokenizer"),
);
