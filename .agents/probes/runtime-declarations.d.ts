import "node:module";

declare module "module" {
  interface Module {
    _compile(content: string, filename: string): void;
  }

  namespace Module {
    let _extensions: Record<string, (module: Module, filename: string) => void>;
  }
}
