import { createHook } from "node:async_hooks";
import { expect } from "chai";
import { SaveComponentFiles } from "../../attachments";
import {
  megabyteOfNestedObjects,
  wideArray,
  wideObject,
} from "../helpers/attachment-bodies";
import { untouchedRequestContext } from "../helpers/request-context";

const DEEPEST_LEVELS = 62;
const WIDTH = 200_000;
const SAVE_BOUND_MS = 10_000;

/**
 * The most promises a save may create. The nodes of the bodies below number
 * between 171,000 and 400,000, and a promise per node held about 430 MB.
 */
const PROMISE_BOUND = 10_000;

const BODIES = [
  {
    label: "1 MiB at depth 63",
    build: () => megabyteOfNestedObjects(DEEPEST_LEVELS - 1),
  },
  {
    label: "1 MiB at depth 64",
    build: () => megabyteOfNestedObjects(DEEPEST_LEVELS),
  },
  { label: `${WIDTH} array entries`, build: () => wideArray(WIDTH) },
  { label: `${WIDTH} object entries`, build: () => wideObject(WIDTH) },
];

/** Counts the promises created from now until `stop` is called. */
function countPromises() {
  let created = 0;
  const hook = createHook({
    init: (_asyncId, type) => {
      if (type === "PROMISE") created += 1;
    },
  }).enable();
  return {
    stop: () => {
      hook.disable();
      return created;
    },
  };
}

describe("[unit] saving a wide or deep file field", () => {
  for (const { label, build } of BODIES) {
    it(`saves ${label} whole in under ${SAVE_BOUND_MS} ms, with no promise per node`, async function () {
      this.timeout(SAVE_BOUND_MS * 2);
      const value = build();
      const promises = countPromises();
      const started = performance.now();
      const saved = await SaveComponentFiles(
        {
          context: untouchedRequestContext(),
          componentIds: [],
          fields: [{ id: "f", key: "f", kind: "image", storage: "s" }],
          submitted: { f: value },
          before: {},
        },
        async (document) => ({ document, result: document }),
      );
      const milliseconds = performance.now() - started;
      const created = promises.stop();
      expect(saved.f).to.not.equal(value);
      expect(JSON.stringify(saved.f)).to.equal(JSON.stringify(value));
      expect(milliseconds, "time").to.be.below(SAVE_BOUND_MS);
      expect(created, "promises created").to.be.below(PROMISE_BOUND);
    });
  }

  it("copies keys named like Object.prototype members, and an own __proto__ key, as plain data", async () => {
    const cover = {
      ["__proto__"]: { inherited: 1 },
      constructor: "c",
      toString: ["a", { hasOwnProperty: null }],
      z: 1,
      a: 2,
    };
    const saved = await SaveComponentFiles(
      {
        context: untouchedRequestContext(),
        componentIds: [],
        fields: [{ id: "cover", key: "cover", kind: "image" }],
        submitted: { cover },
        before: {},
      },
      async (document) => ({ document, result: document }),
    );
    expect(saved.cover).to.not.equal(cover);
    expect(Object.getPrototypeOf(saved.cover)).to.equal(Object.prototype);
    expect(Object.keys(cover)).to.include("__proto__");
    expect(saved.cover).to.deep.equal(cover);
    expect(JSON.stringify(saved.cover)).to.equal(JSON.stringify(cover));
  });
});
