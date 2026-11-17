import type { OpResult } from "@antelopejs/interface-dms-builder";

/** The sentence a refused configuration step answers with; empty for a result that is not that refusal. */
export function refusalOf(result: OpResult<unknown>): string {
  if (result.ok || result.error.code !== "invalid_config") {
    return "";
  }
  return result.error.issues.map(({ message }) => message).join("\n");
}
