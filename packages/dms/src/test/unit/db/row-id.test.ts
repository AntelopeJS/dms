import { expect } from "chai";
import { rowIdText } from "../../../db";

describe("[unit] db — rowIdText", () => {
  it("reads a primitive id as String reads it", () => {
    expect(rowIdText("a1")).to.equal("a1");
    expect(rowIdText(7)).to.equal("7");
    expect(rowIdText(null)).to.equal("null");
    expect(rowIdText(undefined)).to.equal("undefined");
  });

  it("refuses an id that holds a list or a document", () => {
    expect(() => rowIdText(["a", "b"])).to.throw("A row id holds");
    expect(() => rowIdText({ id: "a" })).to.throw("A row id holds");
  });
});
