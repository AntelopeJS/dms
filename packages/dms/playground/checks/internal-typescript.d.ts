import "typescript";

declare module "typescript" {
  /** Exported at runtime by the compiler but left out of its public declarations. */
  function getScriptKindFromFileName(fileName: string): ScriptKind;

  /** Strips the parentheses, assertions and non-null operators around an expression. */
  function skipOuterExpressions(node: Expression): Expression;

  interface SourceFile {
    /** Filled by the parser and left out of the public declarations. */
    readonly parseDiagnostics: readonly DiagnosticWithLocation[];
  }
}
