/**
 * A read-only array or key-value field (a record's details) shows its rows,
 * through its own control disabled, rather than the "2 rows" a table cell
 * reads; an empty one still reads "empty" through the display.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const control = readFileSync(
  new URL(
    "../layers/dms-ui/app/build/components/form/FormFieldControl.vue",
    import.meta.url,
  ),
  "utf8",
);

describe("a read-only list field", () => {
  it("reads through its own control", () => {
    expect(control).toMatch(
      /const READS_AS_CONTROL = new Set\(\["array", "key_value"\]\);/,
    );
    expect(control).toMatch(
      /READS_AS_CONTROL\.has\(props\.field\.type\) &&\s*hasRows\(state\.value\[props\.field\.id\]\)/,
    );
    expect(control).toMatch(/v-if="showsDisplay"/);
  });
});
