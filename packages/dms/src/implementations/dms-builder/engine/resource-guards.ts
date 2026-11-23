import type { MutationOpts, OpResult } from "@antelopejs/interface-dms-builder";
import type { SourceFile } from "ts-morph";
import { mappedConnectionOfFile } from "./mapped-modules";
import { resourceVersion } from "./resource-structure";

/** The refusal of an operation on a resource whose files changed since the version it read. */
export function checkVersion(
  ref: string,
  databaseFile: SourceFile,
  dataApiFile: SourceFile,
  opts?: MutationOpts,
): OpResult<never> | undefined {
  if (!opts?.expectedVersion) {
    return undefined;
  }
  const current = resourceVersion(databaseFile, dataApiFile);
  if (current !== opts.expectedVersion) {
    return {
      ok: false,
      error: { code: "stale", ref, currentVersion: current },
    };
  }
  return undefined;
}

/** The refusal for an operation that would create or alter a column of a mapped module's table. */
export function mappedRefusal(filepath: string): OpResult<never> | undefined {
  const connection = mappedConnectionOfFile(filepath);
  if (!connection) {
    return undefined;
  }
  return {
    ok: false,
    error: {
      code: "invalid_config",
      issues: [
        {
          pointer: "",
          message: `this table mirrors the "${connection}" database, whose columns are its own; map columns with MapResources`,
        },
      ],
    },
  };
}
