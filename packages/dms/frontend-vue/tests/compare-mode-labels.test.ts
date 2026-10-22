/**
 * A filter chip and the filter menu name a filter's compare mode through
 * `dms.table.compare_mode.<id>`: every mode the interface registers has its
 * label in every locale, so no chip reads a raw key.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import en from "../layers/dms-ui/i18n/locales/ui-en-GB.json";
import fr from "../layers/dms-ui/i18n/locales/ui-fr-FR.json";

const COMPARE_TYPES = resolve(
  __dirname,
  "../../../interface-dms/src/base/data-types/compare-types.ts",
);
const REGISTERED_MODE = /@RegisterDataCompareMode\(\s*"([a-z_]+)"/g;

const registeredModes = [
  ...readFileSync(COMPARE_TYPES, "utf8").matchAll(REGISTERED_MODE),
].map(([, id]) => id!);

describe("compare mode labels", () => {
  it("reads the modes the interface registers", () => {
    expect(registeredModes).toContain("array_contains_string");
  });

  it.each([
    ["en-GB", en],
    ["fr-FR", fr],
  ])("labels every mode in %s", (_, messages) => {
    const labels = messages.dms.table.compare_mode as Record<string, string>;
    expect(registeredModes.filter((id) => !labels[id])).toEqual([]);
  });
});
