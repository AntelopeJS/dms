import { expect } from "chai";
import {
  ignoreModuleContextGone,
  isModuleContextGone,
  MODULE_CONTEXT_GONE,
} from "../../../../../implementations/dms/page/notifications";

describe("[unit] implementations/dms/page/notifications module context gone", () => {
  const gone = Object.assign(new Error("gone"), { code: MODULE_CONTEXT_GONE });

  it("recognises an error carrying the invalidation code", () => {
    expect(isModuleContextGone(gone)).to.equal(true);
    expect(isModuleContextGone({ code: MODULE_CONTEXT_GONE })).to.equal(true);
  });

  it("refuses values that do not carry the code", () => {
    expect(isModuleContextGone(new Error("other"))).to.equal(false);
    expect(isModuleContextGone({ code: "ERR_OTHER" })).to.equal(false);
    expect(isModuleContextGone(MODULE_CONTEXT_GONE)).to.equal(false);
    expect(isModuleContextGone(null)).to.equal(false);
    expect(isModuleContextGone(undefined)).to.equal(false);
  });

  it("ignores the invalidation error and rethrows anything else as it came", () => {
    expect(() => ignoreModuleContextGone(gone)).to.not.throw();
    const other = new Error("other");
    expect(() => ignoreModuleContextGone(other)).to.throw(other);
    expect(() => ignoreModuleContextGone("text")).to.throw("text");
  });
});
