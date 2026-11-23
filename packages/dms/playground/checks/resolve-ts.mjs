import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, next) {
    const extensionless =
      specifier.startsWith(".") && !/\.[cm]?[jt]s$/.test(specifier);
    return next(extensionless ? `${specifier}.ts` : specifier, context);
  },
});
