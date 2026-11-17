import type { ControllerClass } from "@antelopejs/interface-api";

const controllersInBuild = new Set<ControllerClass>();

/**
 * @internal Builds the add form of a relation to `controller`, or nothing
 * when that form is already being built further up: a self-relation, or a
 * cycle through other tables, would nest it forever.
 */
export function buildOutsideCycle<T>(
  controller: ControllerClass,
  build: () => T,
): T | undefined {
  if (controllersInBuild.has(controller)) return undefined;
  controllersInBuild.add(controller);
  try {
    return build();
  } finally {
    controllersInBuild.delete(controller);
  }
}
