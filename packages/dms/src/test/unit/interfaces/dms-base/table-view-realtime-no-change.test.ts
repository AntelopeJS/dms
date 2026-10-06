import { expect } from "chai";
import { reportsNoChange } from "@antelopejs/interface-dms/base/table-view/internal/realtime";

// A bulk write the row rules refused entirely changed nothing: its ids must
// not be broadcast as deleted or updated, or every session watching the table
// (the caller included) would drop rows that are still there.

describe("Table view realtime: writes that changed nothing", () => {
  it("reads a zero count from each bulk route", () => {
    expect(reportsNoChange(0)).to.equal(true);
    expect(reportsNoChange({ deleted: 0 })).to.equal(true);
    expect(reportsNoChange({ success: true, archivedCount: 0 })).to.equal(true);
    expect(reportsNoChange({ success: true, restoredCount: 0 })).to.equal(true);
  });

  it("keeps broadcasting a write that changed rows", () => {
    expect(reportsNoChange(2)).to.equal(false);
    expect(reportsNoChange({ deleted: 1 })).to.equal(false);
    expect(reportsNoChange({ success: true, archivedCount: 3 })).to.equal(
      false,
    );
  });

  it("keeps broadcasting a result that carries no count", () => {
    expect(reportsNoChange(undefined)).to.equal(false);
    expect(reportsNoChange({ ok: true })).to.equal(false);
    expect(reportsNoChange({ _id: "17" })).to.equal(false);
  });
});
