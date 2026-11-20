import { expect } from "chai";
import {
  kpiValueData,
  percentOf,
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
 * A KpiCard with `valueFormat: "percent"` reads percent units, so the helper
 * answers 25 for 1 of 4, and no figure where a share cannot be stated.
 */
describe("[unit] interfaces/dms-base/query-response — percentOf", () => {
  it("answers the numerator over the denominator in percent, not as a fraction", async () => {
    expect(await percentOf(answering(1), answering(4)).run()).to.equal(25);
  });

  it("answers a share of whole counts without rounding noise", async () => {
    expect(await percentOf(answering(7), answering(100)).run()).to.equal(7);
    expect(await percentOf(answering(29), answering(100)).run()).to.equal(29);
  });

  it("answers more than 100 when the numerator outgrows the denominator", async () => {
    expect(await percentOf(answering(3), answering(2)).run()).to.equal(150);
  });

  it("answers null for a denominator of 0, not Infinity or NaN", async () => {
    expect(await percentOf(answering(3), answering(0)).run()).to.equal(null);
    expect(await percentOf(answering(0), answering(0)).run()).to.equal(null);
  });

  it("answers 0, a measured figure, for a numerator of 0 over rows", async () => {
    expect(await percentOf(answering(0), answering(8)).run()).to.equal(0);
  });

  it("answers null for a side that measured nothing, instead of reading it as 0", async () => {
    expect(await percentOf(answering(null), answering(4)).run()).to.equal(null);
    expect(await percentOf(answering(undefined), answering(4)).run()).to.equal(
      null,
    );
    expect(await percentOf(answering(2), answering(null)).run()).to.equal(null);
  });

  it("answers null for a side that is not a finite number", async () => {
    expect(await percentOf(answering(Number.NaN), answering(4)).run()).to.equal(
      null,
    );
    expect(
      await percentOf(answering(1), answering(Number.POSITIVE_INFINITY)).run(),
    ).to.equal(null);
  });

  it("sends nothing until it is run, and runs each side once", async () => {
    const numerator = answering(1);
    const denominator = answering(2);
    const percent = percentOf(numerator, denominator);

    expect([numerator.runs, denominator.runs]).to.deep.equal([0, 0]);
    await percent.run();
    expect([numerator.runs, denominator.runs]).to.deep.equal([1, 1]);
  });

  it("rejects when either side rejects, rather than answering from the other", async () => {
    const refusing = {
      run: () => Promise.reject<number>(new Error("relation does not exist")),
    };

    let refused = false;
    try {
      await percentOf(answering(1), refusing).run();
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
    expect(kpiValueData(50)).to.deep.equal({ value: 50 });
  });

  it("states the preceding figure and the change in percent", () => {
    expect(kpiValueData(50, { previous: 25 })).to.deep.equal({
      value: 50,
      previousValue: 25,
      delta: 100,
    });
  });

  it("states a fall as a negative percent", () => {
    expect(kpiValueData(25, { previous: 50 })).to.deep.equal({
      value: 25,
      previousValue: 50,
      delta: -50,
    });
  });

  it("states the change of a percentage relative to it, not the points it moved", async () => {
    const answer = kpiValueData(
      await percentOf(answering(1), answering(4)).run(),
      { previous: await percentOf(answering(2), answering(4)).run() },
    );

    expect(answer).to.deep.equal({ value: 25, previousValue: 50, delta: -50 });
  });

  it("states the previous figure but no change from a preceding 0", () => {
    expect(kpiValueData(50, { previous: 0 })).to.deep.equal({
      value: 50,
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
    expect(kpiValueData(null, { previous: 25 })).to.deep.equal({
      previousValue: 25,
    });
  });

  it("leaves the preceding figure absent when it measured nothing", () => {
    expect(kpiValueData(50, { previous: null })).to.deep.equal({
      value: 50,
    });
  });
});
