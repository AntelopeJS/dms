import { expect } from "chai";
import { isRuleOperand } from "../../../../implementations/dms-base/services";

type Chain = { next: Chain[] };

function chain(depth: number) {
  let tail: Chain = { next: [] };
  for (let level = 0; level < depth; level += 1) {
    tail = { next: [tail] };
  }
  return tail;
}

describe("[unit] dms-base — row rule operands", () => {
  it("accepts scalars, dates, lists and plain records of them", () => {
    const operands = [
      "open",
      41,
      false,
      null,
      undefined,
      new Date(0),
      ["a", 1, [null]],
      { at: new Date(0), tags: ["a"], nested: { none: undefined } },
      Object.create(null),
    ];
    expect(operands.map((operand) => isRuleOperand(operand))).to.deep.equal(
      operands.map(() => true),
    );
  });

  it("refuses what no database records as given, wherever it sits", () => {
    const operands = [
      41n,
      Symbol("x"),
      () => 1,
      new Map([["a", 1]]),
      Buffer.from("a"),
      new (class Held {})(),
      [1, 1n],
      { deep: { list: [Symbol("y")] } },
    ];
    expect(operands.map((operand) => isRuleOperand(operand))).to.deep.equal(
      operands.map(() => false),
    );
  });

  it("refuses a cyclic record and accepts a value held twice", () => {
    type Cyclic = { name: string; self?: Cyclic };
    const cyclic: Cyclic = { name: "a" };
    cyclic.self = cyclic;
    const shared = { n: 1 };
    expect([
      isRuleOperand(cyclic),
      isRuleOperand({ a: shared, b: [shared] }),
    ]).to.deep.equal([false, true]);
  });

  it("walks a deeply nested value without exhausting the stack", () => {
    expect(isRuleOperand(chain(50_000))).to.equal(true);
  });
});
