import type { ConfigValue } from "@antelopejs/interface-dms-builder";
import { expect } from "chai";
import {
  createImportCollector,
  serializeValue,
} from "../../../implementations/dms-builder/engine/value";

describe("writing a config value as source text", () => {
  it("writes a __proto__ key as a computed property, which defines an own key", () => {
    const { ctx } = createImportCollector();
    const entries: [string, ConfigValue][] = [
      ["__proto__", { a: 1 }],
      ["own", 2],
    ];
    const config = Object.fromEntries(entries);

    expect(serializeValue(config, ctx)).to.equal(
      '{ ["__proto__"]: { a: 1 }, own: 2 }',
    );
  });

  it("writes a name that is not an identifier quoted", () => {
    const { ctx } = createImportCollector();
    const config = { "data-id": 1 };

    expect(serializeValue(config, ctx)).to.equal('{ "data-id": 1 }');
  });
});
