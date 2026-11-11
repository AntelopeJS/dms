import { readFileSync } from "node:fs";
import { resolveModule } from "../../../../implementations/dms-builder/engine/module-loader";

/** Whether the installed `@antelopejs/interface-dms` declares `PriceType`'s `currency` option. */
export function installedPriceTypeHasCurrency(): boolean {
  const options = resolveModule(
    "@antelopejs/interface-dms/base/data-types/default/options",
  ).replace(/\.js$/, ".d.ts");
  return readFileSync(options, "utf8").includes("currency");
}
