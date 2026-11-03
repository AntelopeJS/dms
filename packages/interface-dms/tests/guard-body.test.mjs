import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { z } from "zod";
import { HTTPResult } from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import {
  createGuardedConfirmRoute,
  parseGuardBody,
} from "../dist/base/table-view/internal/guards.js";
import { TableViewMeta } from "../dist/base/table-view/meta.js";

const NOT_OBJECTS = ["null", "5", '"text"', "true", "[1]", "[]"];

const MAX_DEPTH = 64;
const TOO_DEEP = 10_000;
const SIBLINGS = 64;

/**
 * A JSON object body that nests arrays or objects `levels` deep, the body
 * itself counted.
 *
 * @param {number} levels
 * @param {"array" | "object"} container
 */
const nestedBody = (levels, container) => {
  if (levels === 1) return "{}";
  if (container === "array") {
    return `{"k":${"[".repeat(levels - 1)}${"]".repeat(levels - 1)}}`;
  }
  return `${'{"k":'.repeat(levels - 1)}{}${"}".repeat(levels - 1)}`;
};

/** @param {() => unknown} run */
const refusal = (run) => {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
};

/**
 * @param {unknown} error
 * @param {string} label
 */
const assertRefusedAs400 = (error, label) => {
  assert.ok(error instanceof HTTPResult, `${label}: ${String(error)}`);
  assert.equal(error.getStatus(), 400, label);
  assert.match(String(error.getBody()), /64/, label);
};

await test("a JSON object body decodes to its fields, as text or bytes", () => {
  const text = '{"title":"Plan","count":2}';
  assert.deepEqual(parseGuardBody(text), { title: "Plan", count: 2 });
  assert.deepEqual(parseGuardBody(Buffer.from(text)), {
    title: "Plan",
    count: 2,
  });
});

await test("nested JSON values keep their shape through the decoder", () => {
  const text =
    '{"list":[1,{"flag":true,"none":null}],"inner":{"deep":["x",[]]}}';
  const expected = {
    list: [1, { flag: true, none: null }],
    inner: { deep: ["x", []] },
  };
  assert.deepEqual(parseGuardBody(text), expected);
  assert.deepEqual(parseGuardBody(Buffer.from(text)), expected);
});

await test("a body that is already decoded, or absent, keeps its answers", () => {
  const decoded = { title: "Plan" };
  assert.equal(parseGuardBody(decoded), decoded);
  assert.deepEqual(parseGuardBody(""), {});
  assert.deepEqual(parseGuardBody(undefined), {});
  assert.deepEqual(parseGuardBody(null), {});
});

await test("malformed JSON is still refused", () => {
  assert.throws(() => parseGuardBody("{"), SyntaxError);
  assert.throws(() => parseGuardBody(Buffer.from("{")), SyntaxError);
});

await test("a JSON body that is not an object is refused, as text or bytes", () => {
  for (const body of NOT_OBJECTS) {
    assert.throws(() => parseGuardBody(body), TypeError, body);
    assert.throws(() => parseGuardBody(Buffer.from(body)), TypeError, body);
  }
});

await test("a confirmation body that is not an object is refused before the guard runs", async () => {
  class GuardedController {}
  const calls = [];
  GetMetadata(GuardedController, TableViewMeta).setControllerGuards({
    delete: () => void calls.push("guard"),
  });
  const guarded = createGuardedConfirmRoute(
    { func: async () => calls.push("write"), args: [], method: "delete" },
    "delete",
  );
  for (const body of NOT_OBJECTS) {
    await assert.rejects(
      guarded.func.call(
        new GuardedController(),
        {},
        { id: ["row-1"] },
        Buffer.from(body),
      ),
      TypeError,
      body,
    );
  }
  assert.deepEqual(calls, []);
});

await test("a JSON key named __proto__ is not carried into the decoded fields", () => {
  const fields = parseGuardBody('{"__proto__":{"admin":true},"title":"Plan"}');
  assert.deepEqual(Object.keys(fields), ["title"]);
  assert.equal(Object.getPrototypeOf(fields), Object.prototype);
});

for (const container of ["array", "object"]) {
  await test(`a body nested ${TOO_DEEP} ${container} levels deep answers 400, as text or bytes`, () => {
    const body = nestedBody(TOO_DEEP, container);
    assertRefusedAs400(
      refusal(() => parseGuardBody(body)),
      "text",
    );
    assertRefusedAs400(
      refusal(() => parseGuardBody(Buffer.from(body))),
      "bytes",
    );
  });

  await test(`a body nested ${MAX_DEPTH} ${container} levels deep is still decoded whole`, () => {
    const body = nestedBody(MAX_DEPTH, container);
    assert.equal(JSON.stringify(parseGuardBody(body)), body);
    assert.equal(JSON.stringify(parseGuardBody(Buffer.from(body))), body);
  });

  await test(`a body nested ${MAX_DEPTH + 1} ${container} levels deep answers 400`, () => {
    assertRefusedAs400(
      refusal(() => parseGuardBody(nestedBody(MAX_DEPTH + 1, container))),
      "one past the bound",
    );
  });
}

/**
 * @param {"array" | "object"} container
 * @param {number} containers
 */
const element = (container, containers) =>
  container === "array"
    ? "[".repeat(containers) + "]".repeat(containers)
    : '{"a":'.repeat(containers) + "1" + "}".repeat(containers);

/**
 * `{"k":[E,...,E,L]}`: `siblings` elements of `containers` levels, then one of
 * `lastContainers`. The body and the `k` array count as two levels.
 *
 * @param {"array" | "object"} container
 * @param {number} lastContainers
 */
const withLastElement = (container, lastContainers) => {
  const elements = Array(SIBLINGS).fill(element(container, MAX_DEPTH - 2));
  elements.push(element(container, lastContainers));
  return `{"k":[${elements.join(",")}]}`;
};

for (const container of ["array", "object"]) {
  await test(`${container} siblings ${MAX_DEPTH} levels deep are decoded whole`, () => {
    const body = withLastElement(container, MAX_DEPTH - 2);
    assert.equal(JSON.stringify(parseGuardBody(body)), body);
  });

  await test(`one ${MAX_DEPTH + 1}-deep ${container} element last among ${MAX_DEPTH}-deep siblings answers 400`, () => {
    const body = withLastElement(container, MAX_DEPTH - 1);
    assertRefusedAs400(
      refusal(() => parseGuardBody(body)),
      "text",
    );
    assertRefusedAs400(
      refusal(() => parseGuardBody(Buffer.from(body))),
      "bytes",
    );
  });
}

await test("a confirmation body nested too deep answers 400 before the guard runs", async () => {
  class GuardedController {}
  const calls = [];
  GetMetadata(GuardedController, TableViewMeta).setControllerGuards({
    delete: () => void calls.push("guard"),
  });
  const guarded = createGuardedConfirmRoute(
    { func: async () => calls.push("write"), args: [], method: "delete" },
    "delete",
  );
  /** @param {string} body */
  const run = (body) =>
    guarded.func.call(
      new GuardedController(),
      {},
      { id: ["row-1"] },
      Buffer.from(body),
    );
  await assert.rejects(run(nestedBody(TOO_DEEP, "array")), (error) => {
    assertRefusedAs400(error, "deep confirmation");
    return true;
  });
  assert.deepEqual(calls, []);
  await run(nestedBody(MAX_DEPTH, "array"));
  assert.deepEqual(calls, ["guard", "write"]);
});

await test("a nested JSON key named __proto__ is dropped, as the top-level one is", () => {
  const text =
    '{"inner":{"__proto__":{"admin":true},"title":"Plan"},"list":[{"__proto__":1,"n":2}]}';
  for (const body of [text, Buffer.from(text)]) {
    const fields = parseGuardBody(body);
    assert.deepEqual(fields, {
      inner: { title: "Plan" },
      list: [{ n: 2 }],
    });
    assert.equal(Object.getPrototypeOf(fields.inner), Object.prototype);
    assert.equal(fields.inner.admin, undefined);
  }
});

/**
 * Limits of the load tests, each run in a fresh process whose old-space heap is
 * capped. Measured on a 32-core machine at load 10 to 15: the decoder takes
 * 0.02 to 0.7 s and peaks under 215 MB on these bodies. Through the real API
 * server, the recursive schema this branch started from took 3.3 s on a valid
 * 64-deep body of 1 MiB, and the level-by-level schema of the first fix took
 * 11 s on it and overran a 4 GB heap on a 65-deep one, so these limits fail on
 * both.
 */
const LOAD_LIMITS = {
  heapMb: 256,
  rejectMs: 2_000,
  decodeMs: 3_000,
  rssMb: 400,
};
const LOAD_RUNNER = fileURLToPath(
  new URL("./helpers/guard-body-load.mjs", import.meta.url),
);

const LOAD_RUN = z.object({
  outcome: z.union([z.number(), z.string()]),
  bodyBytes: z.number(),
  milliseconds: z.number(),
  peakRssMb: z.number(),
});

/** @param {string} bodyName */
const runLoad = async (bodyName) => {
  const { stdout } = await promisify(execFile)(process.execPath, [
    `--max-old-space-size=${LOAD_LIMITS.heapMb}`,
    LOAD_RUNNER,
    bodyName,
  ]);
  return LOAD_RUN.parse(JSON.parse(stdout));
};

for (const bodyName of ["arrays-65", "objects-65", "arrays-65-last"]) {
  await test(`a 1 MiB confirmation body of ${bodyName} levels answers 400 within ${LOAD_LIMITS.rejectMs} ms and ${LOAD_LIMITS.rssMb} MB`, async () => {
    const run = await runLoad(bodyName);
    assert.ok(run.bodyBytes > 1_000_000, "the body is about 1 MiB");
    assert.equal(run.outcome, 400);
    assert.ok(
      run.milliseconds < LOAD_LIMITS.rejectMs,
      `${run.milliseconds} ms`,
    );
    assert.ok(run.peakRssMb < LOAD_LIMITS.rssMb, `${run.peakRssMb} MB`);
  });
}

for (const bodyName of [
  "arrays-64",
  "objects-64",
  "flat-array",
  "array-200k-entries",
  "object-200k-entries",
  "body-200k-keys",
]) {
  await test(`a confirmation body of ${bodyName} is decoded whole within ${LOAD_LIMITS.decodeMs} ms and ${LOAD_LIMITS.rssMb} MB`, async () => {
    const run = await runLoad(bodyName);
    assert.equal(run.outcome, "decoded");
    assert.ok(
      run.milliseconds < LOAD_LIMITS.decodeMs,
      `${run.milliseconds} ms`,
    );
    assert.ok(run.peakRssMb < LOAD_LIMITS.rssMb, `${run.peakRssMb} MB`);
  });
}
