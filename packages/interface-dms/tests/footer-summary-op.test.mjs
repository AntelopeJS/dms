import assert from "node:assert/strict";
import test from "node:test";
import { TableViewMeta } from "../dist/base/table-view/meta.js";
import { serializeFooter } from "../dist/base/table-view/internal/footer.js";

class Payments {}

/** @param {string} op */
const footerSumming = (op) => {
  const meta = new TableViewMeta(Payments);
  meta.setColumn("amount", { name: "Amount" });
  return () =>
    serializeFooter("Payments", meta, {
      summary: [{ label: "Figure", field: "amount", op }],
    });
};

await test("a footer summary whose op is neither sum nor count is refused at registration", () => {
  assert.throws(
    footerSumming("avg"),
    /footer summary "Figure" on Payments has op "avg": give it "sum" or "count"/,
  );
  assert.equal(footerSumming("sum")().summary?.[0]?.op, "sum");
  assert.equal(footerSumming("count")().summary?.[0]?.op, "count");
});
