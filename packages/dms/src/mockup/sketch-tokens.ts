import {
  type CSSToken,
  isTokenAtKeyword,
  isTokenBadString,
  isTokenBadURL,
  isTokenCloseCurly,
  isTokenCloseParen,
  isTokenCloseSquare,
  isTokenComma,
  isTokenDelim,
  isTokenFunction,
  isTokenIdent,
  isTokenNumeric,
  isTokenOpenCurly,
  isTokenOpenParen,
  isTokenOpenSquare,
  isTokenString,
  isTokenURL,
  isTokenWhiteSpaceOrComment,
  tokenize,
} from "@csstools/css-tokenizer";

export type { CSSToken };

const tokenizer = {
  isTokenAtKeyword,
  isTokenBadString,
  isTokenBadURL,
  isTokenCloseCurly,
  isTokenCloseParen,
  isTokenCloseSquare,
  isTokenComma,
  isTokenDelim,
  isTokenFunction,
  isTokenIdent,
  isTokenNumeric,
  isTokenOpenCurly,
  isTokenOpenParen,
  isTokenOpenSquare,
  isTokenString,
  isTokenURL,
  isTokenWhiteSpaceOrComment,
  tokenize,
};

/**
 * Whether the tokenizer reads `url(x)` as one url token for `x`, as the CSS
 * Syntax spec does. A tokenizer that keeps its exports but reads CSS
 * differently, even one answering no tokens at all, fails this, so the check
 * refuses to load rather than pass CSS it never read.
 */
function readsCss(): boolean {
  const tokens = tokenize({ css: "url(x)" });
  const [first, end] = tokens;
  return (
    tokens.length === 2 &&
    first !== undefined &&
    isTokenURL(first) &&
    first[4].value === "x" &&
    end !== undefined &&
    !isTokenURL(end)
  );
}

function loadCssTokenizer(): typeof tokenizer {
  if (!readsCss()) {
    throw new Error("the CSS tokenizer does not read url(x) as a url token");
  }
  return tokenizer;
}

/**
 * The CSS tokenizer the sketch check reads CSS with, `@csstools/css-tokenizer`
 * 4, the version jsdom's CSS code already uses, read once before use. It is an
 * ES module, loaded from this CommonJS module through `require(esm)`, which
 * every Node jsdom 29 runs on supports.
 */
export const cssTokenizer = loadCssTokenizer();
