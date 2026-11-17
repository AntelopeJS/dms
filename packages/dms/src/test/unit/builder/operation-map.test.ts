import * as Builder from "@antelopejs/interface-dms-builder";
import { expect } from "chai";

const CONSTANT_NAME = /^[A-Z][A-Z0-9_]*$/;

/**
 * The interface exports one function per operation. A caller that picks an
 * operation by name reads `Operations`, so an operation missing from it is an
 * operation that caller can never reach. A constant, written in capitals such as
 * `DATABASE_ENGINE_SCHEMES`, is not an operation.
 */
describe("operation map", () => {
  it("holds every operation the interface exports, by the name it is exported under", () => {
    const exported = new Map(
      Object.entries(Builder).filter(
        ([name]) => name !== "Operations" && !CONSTANT_NAME.test(name),
      ),
    );
    expect(Object.keys(Builder.Operations).sort()).to.deep.equal(
      [...exported.keys()].sort(),
    );
    for (const [name, operation] of Object.entries(Builder.Operations)) {
      expect(operation, name).to.equal(exported.get(name));
    }
  });
});
