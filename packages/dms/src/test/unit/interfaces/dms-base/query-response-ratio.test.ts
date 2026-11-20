import { expect } from "chai";
import {
  kpiValueData,
  ratioOf,
} from "@antelopejs/interface-dms/base/query-response";

/** A calculation that answers once run, and records that it was. */
function answering(answer: number | null | undefined) {
  const query = {
    runs: 0,
    run: () => {
      query.runs += 1;
      return Promise.resolve(answer);
    },
  };
  return query;
}

/**
 * A KpiCard with `valueFormat: "percent"` reads a fraction, so the helper answers
 * 0.25 for 1 of 4, and no figure where a share cannot be stated.
 */
describe("[unit] interfaces/dms-base/query-response — ratioOf", () => {
  it("answers the numerator over the denominator as a fraction, not a percent", async () => {
    expect(await ratioOf(answering(1), answering(4)).run()).to.equal(0.25);
  });

  it("answers null for a denominator of 0, not Infinity or NaN", async () => {
    expect(await ratioOf(answering(3), answering(0)).run()).to.equal(null);
    expect(await ratioOf(answering(0), answering(0)).run()).to.equal(null);
  });

  it("answers 0, a measured figure, for a numerator of 0 over rows", async () => {
    expect(await ratioOf(answering(0), answering(8)).run()).to.equal(0);
  });

  it("answers null for a side that measured nothing, instead of reading it as 0", async () => {
    expect(await ratioOf(answering(null), answering(4)).run()).to.equal(null);
    expect(await ratioOf(answering(undefined), answering(4)).run()).to.equal(
      null,
    );
    expect(await ratioOf(answering(2), answering(null)).run()).to.equal(null);
  });

  it("answers null for a side that is not a finite number", async () => {
    expect(await ratioOf(answering(Number.NaN), answering(4)).run()).to.equal(
      null,
    );
    expect(
      await ratioOf(answering(1), answering(Number.POSITIVE_INFINITY)).run(),
    ).to.equal(null);
  });

  it("sends nothing until it is run, and runs each side once", async () => {
    const numerator = answering(1);
    const denominator = answering(2);
    const ratio = ratioOf(numerator, denominator);

    expect([numerator.runs, denominator.runs]).to.deep.equal([0, 0]);
    await ratio.run();
    expect([numerator.runs, denominator.runs]).to.deep.equal([1, 1]);
  });

  it("rejects when either side rejects, rather than answering from the other", async () => {
    const refusing = {
      run: () => Promise.reject<number>(new Error("relation does not exist")),
    };

    let refused = false;
    try {
      await ratioOf(answering(1), refusing).run();
    } catch {
      refused = true;
    }
    expect(refused).to.equal(true);
  });
});

/**
 * The same delta a card reads from `kpiCardData`: in percent, absent from a
 * preceding zero, so a block shows none rather than a stand-in.
 */
describe("[unit] interfaces/dms-base/query-response — kpiValueData", () => {
  it("answers the figure alone when nothing precedes it", () => {
    expect(kpiValueData(0.5)).to.deep.equal({ value: 0.5 });
  });

  it("states the preceding figure and the change in percent", () => {
    expect(kpiValueData(0.5, { previous: 0.25 })).to.deep.equal({
      value: 0.5,
      previousValue: 0.25,
      delta: 100,
    });
  });

  it("states a fall as a negative percent", () => {
    expect(kpiValueData(0.25, { previous: 0.5 })).to.deep.equal({
      value: 0.25,
      previousValue: 0.5,
      delta: -50,
    });
  });

  it("states the previous figure but no change from a preceding 0", () => {
    expect(kpiValueData(0.5, { previous: 0 })).to.deep.equal({
      value: 0.5,
      previousValue: 0,
    });
  });

  it("states no change between two zeros", () => {
    expect(kpiValueData(0, { previous: 0 })).to.deep.equal({
      value: 0,
      previousValue: 0,
      delta: 0,
    });
  });

  it("leaves value absent for a null figure, never writing it as 0", () => {
    expect(kpiValueData(null)).to.deep.equal({});
    expect(kpiValueData(null)).to.not.have.property("value");
  });

  it("states the preceding figure but no change when the figure is null", () => {
    expect(kpiValueData(null, { previous: 0.25 })).to.deep.equal({
      previousValue: 0.25,
    });
  });

  it("leaves the preceding figure absent when it measured nothing", () => {
    expect(kpiValueData(0.5, { previous: null })).to.deep.equal({
      value: 0.5,
    });
  });
});
