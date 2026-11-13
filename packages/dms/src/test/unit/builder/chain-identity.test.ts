import { expect } from "chai";
import { canonicalBody } from "../../../implementations/dms-builder/engine";

/**
 * Two queries may share one model method only when they compute the same thing.
 * That judgement is this comparison, and it decides whether reconfiguring a query
 * rewrites its method or quietly reuses another — so what it does and does not
 * distinguish is worth stating outright.
 *
 * It compares compiled code rather than the parameters behind it: a template
 * applies defaults on the way out, and a chain read back off disk reports them
 * explicitly, so the parameters differ for a chain that is character for
 * character the same.
 */
describe("a chain's identity", () => {
  it("ignores what a bound value is called", () => {
    const left = canonicalBody(
      '{ return this.table.filter((row) => row.key("price").lt(maxPrice)).count(); }',
      ["maxPrice"],
    );
    const right = canonicalBody(
      '{ return this.table.filter((row) => row.key("price").lt(cap)).count(); }',
      ["cap"],
    );
    expect(left).to.equal(right);
  });

  it("ignores how the code was wrapped", () => {
    expect(canonicalBody("{\n\treturn this.table.count();\n}", [])).to.equal(
      canonicalBody("{ return this.table.count(); }", []),
    );
  });

  it("ignores a chain broken onto its hops", () => {
    expect(
      canonicalBody(
        '{\n  return this.table\n    .map((row) => ({\n      bucket: row.key("a"),\n    }))\n    .count();\n}',
        [],
      ),
    ).to.equal(
      canonicalBody(
        '{ return this.table.map((row) => ({ bucket: row.key("a") })).count(); }',
        [],
      ),
    );
  });

  it("separates chains that compute different things", () => {
    const of = (text: string) => canonicalBody(text, []);
    expect(of('{ return this.table.sum("amount"); }')).to.not.equal(
      of('{ return this.table.avg("amount"); }'),
    );
    expect(
      of('{ return this.table.filter((row) => row.key("a").lt(10)).count(); }'),
    ).to.not.equal(
      of('{ return this.table.filter((row) => row.key("a").lt(20)).count(); }'),
    );
  });

  it("tells two bound values apart by where they are used", () => {
    const left = canonicalBody(
      '{ return this.table.filter((row) => row.key("a").lt(cap)).count(); }',
      ["cap"],
    );
    const right = canonicalBody(
      '{ return this.table.filter((row) => row.key("b").lt(cap)).count(); }',
      ["cap"],
    );
    expect(left).to.not.equal(right);
  });

  it("leaves a method call alone when a parameter is named like one", () => {
    const text = canonicalBody(
      '{ return this.table.filter((row) => row.key("min").ge(min)).min("x"); }',
      ["min"],
    );
    expect(text).to.contain('.min("x")');
    expect(text).to.contain(".ge($0)");
  });
});
