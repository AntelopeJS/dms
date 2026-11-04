import "node:module";

declare module "module" {
  interface Module {
    _compile(content: string, filename: string): void;
  }

  namespace Module {
    let _extensions: Record<string, (module: Module, filename: string) => void>;

    // oxlint-disable-next-line anti-slop/no-unknown-returns -- Node's undocumented Module._load answers the exports of whatever module the request names, so its declaration has no narrower return.
    let _load: (request: string, parent: Module | null | undefined, isMain: boolean) => unknown;
  }
}
