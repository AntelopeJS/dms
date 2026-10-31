import "node:module";

declare module "module" {
  interface Module {
    _compile(content: string, filename: string): void;
  }

  namespace Module {
    let _extensions: Record<string, (module: Module, filename: string) => void>;
    function _load(
      request: "@antelopejs/interface-dms/page",
      parent: Module | null | undefined,
      isMain: boolean,
    ): typeof import("../../packages/dms/playground/node_modules/@antelopejs/interface-dms/dist/page.js");
    function _load(
      request: "@antelopejs/interface-database-decorators",
      parent: Module | null | undefined,
      isMain: boolean,
    ): typeof import("../../packages/dms/playground/node_modules/@antelopejs/interface-database-decorators");
    function _load(request: string, parent: Module | null | undefined, isMain: boolean): object;
  }
}
