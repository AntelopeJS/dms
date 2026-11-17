import { expect, it } from "vitest";
import eslintGlobals from "../eslint-globals.generated.mjs";
import { layerAutoImportNames } from "../scripts/layer-auto-imports.mjs";

it("declares every name the layer auto-imports, and no other; run `pnpm eslint-globals` on drift", async () => {
  expect(Object.keys(eslintGlobals)).toEqual(await layerAutoImportNames());
});
