import { ImplementInterface } from "@antelopejs/interface-core";
import * as Builder from "@antelopejs/interface-dms-builder";
import { expect } from "chai";
import * as implementation from "../../../implementations/dms-builder";

/**
 * The module attaches its implementation to the interface when it constructs.
 * The core walks the interface declaration, including the `Operations` map, and
 * requires a function at every path, so the implementation has to answer under
 * `Operations` too.
 */
describe("implementing the builder interface", () => {
  it("attaches the implementation to every operation the interface declares", () => {
    expect(() => ImplementInterface(Builder, implementation)).not.to.throw();
  });

  it("answers every name of the map with the function it exports flat", () => {
    const exported = new Map(Object.entries(implementation));
    const answered = new Map(Object.entries(implementation.Operations));
    expect([...answered.keys()].sort()).to.deep.equal(
      Object.keys(Builder.Operations).sort(),
    );
    for (const [name, operation] of answered) {
      expect(operation, name).to.equal(exported.get(name));
    }
  });
});
