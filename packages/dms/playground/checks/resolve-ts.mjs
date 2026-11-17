import { registerHooks } from "node:module";

/** Resolves the extensionless relative imports of the TypeScript sources the checks load directly. */
registerHooks({
  resolve(specifier, context, next) {
    const extensionless =
      specifier.startsWith(".") && !/\.[cm]?[jt]s$/.test(specifier);
    return next(extensionless ? `${specifier}.ts` : specifier, context);
  },
});
