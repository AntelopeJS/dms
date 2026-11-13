import Module from "node:module";
import { z } from "zod";

const RequireMethodSchema = z.instanceof(Function);

/**
 * Makes every `require` of the named packages fail as Node fails when they are not installed,
 * through `createRequire` as well. Returns a function that installs them again.
 */
export function uninstallPackages(names: string[]): () => void {
  const original = RequireMethodSchema.parse(
    Object.getOwnPropertyDescriptor(Module.prototype, "require")?.value,
  );
  Module.prototype.require = function (
    this: NodeJS.Module,
    request: string,
  ): ReturnType<NodeJS.Module["require"]> {
    if (names.includes(request)) {
      throw Object.assign(
        new Error(
          `Cannot find module '${request}'\nRequire stack:\n- ${__filename}`,
        ),
        { code: "MODULE_NOT_FOUND" },
      );
    }
    return original.call(this, request);
  };
  return () => {
    Object.defineProperty(Module.prototype, "require", { value: original });
  };
}
