import type * as ts from "typescript";
import type { parse } from "vue/compiler-sfc";

/** One script block of a source file, with its offset in that file. */
export interface ApiErrorScript {
  source: string;
  offset: number;
  isSetup?: boolean;
}

/** A toast call that reports a failure outside the canonical presenter. */
export interface ApiErrorToastCall {
  node: ts.CallExpression;
  payload: ts.Expression | undefined;
  method: "add" | "update";
  failure: string | null;
  color: string;
  tree: ts.SourceFile;
}

/** Runtime sources only. Test fixtures and generated directories are excluded. */
export declare function apiErrorSources(root: string): string[];

/** Parses both Vue script blocks without treating template text as JavaScript. */
export declare function apiErrorScripts(
  file: string,
  source: string,
  tools: { parse: typeof parse },
): ApiErrorScript[];

/** Analyzes local toast bindings and failure regions. Cross-file effects are not inferred. */
export declare function analyzeApiErrorScript(
  source: string,
  file: string,
  compiler: typeof ts,
): ApiErrorToastCall[];

/** Returns diagnostics for local failure toasts outside the canonical presenter. */
export declare function checkApiErrorPresentation(roots: string[]): string[];

/** Runs the checker with development dependencies resolved from each frontend root. */
export declare function assertApiErrorPresentation(roots: string[]): void;
