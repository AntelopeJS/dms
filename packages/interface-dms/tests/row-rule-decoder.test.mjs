import assert from "node:assert/strict";
import test from "node:test";
import { assertRowRule } from "../dist/base/table-view/internal/row-rule-shape.js";
import { startCpuClock } from "./helpers/cpu-clock.mjs";

const SUBJECT = "Malformed row rule";
const LEAF = { field: "status", equals: "open" };

/**
 * @param {unknown} rule
 * @returns {string | undefined}
 */
const problemOf = (rule) => {
  try {
    assertRowRule(rule, SUBJECT);
    return undefined;
  } catch (error) {
    assert.ok(error instanceof Error);
    return error.message;
  }
};

/**
 * @param {number} depth
 * @param {(inner: unknown) => unknown} wrap
 * @returns {unknown}
 */
const nested = (depth, wrap) => {
  /** @type {unknown} */
  let rule = LEAF;
  for (let level = 0; level < depth; level += 1) rule = wrap(rule);
  return rule;
};

await test("every operator is accepted, alone, nested and beside a shadowed one", () => {
  const accepted = [
    LEAF,
    { field: "status", notEquals: undefined },
    { field: "status", in: [] },
    { field: "status", notIn: ["open", 3] },
    { and: [LEAF, { or: [LEAF, { not: LEAF }] }] },
    { field: "amount", equals: 41, and: [LEAF] },
  ];
  for (const rule of accepted) assert.equal(problemOf(rule), undefined);
});

await test("a value that is no rule object is refused", () => {
  for (const value of [null, undefined, 5, "x", true, [], () => LEAF]) {
    assert.equal(problemOf(value), `${SUBJECT}: rule must be a rule object`);
  }
});

await test("a rule that names no operator is refused instead of matching every row", () => {
  const message = `${SUBJECT}: rule must name an operator (and, or, not, equals, notEquals, in or notIn)`;
  for (const rule of [{}, { field: "status" }, { field: "status", equal: 1 }]) {
    assert.equal(problemOf(rule), message);
  }
  assert.equal(
    problemOf({ and: [{ field: "status" }] }),
    message.replace("rule must", "rule.and[0] must"),
  );
});

await test("a comparison whose field is no string is refused", () => {
  for (const rule of [
    { equals: 1 },
    { field: 5, equals: 1 },
    { field: null, in: [] },
  ]) {
    assert.equal(problemOf(rule), `${SUBJECT}: rule.field must be a string`);
  }
});

await test("the operand of the operator that dispatches is checked, at every level", () => {
  /** @type {[unknown, string][]} */
  const cases = [
    [
      { field: "a", equals: 41, and: 123 },
      "rule.and must be an array of rules",
    ],
    [{ field: "a", notIn: [41], in: 123 }, "rule.in must be an array"],
    [
      { and: [LEAF, { field: "b", in: "x" }] },
      "rule.and[1].in must be an array",
    ],
    [
      { or: [LEAF, { not: { field: "b", notIn: 7 } }] },
      "rule.or[1].not.notIn must be an array",
    ],
    [
      { not: { field: "b", equals: 1, or: {} } },
      "rule.not.or must be an array of rules",
    ],
    [{ not: null }, "rule.not must be a rule object"],
    [{ not: [] }, "rule.not must be a rule object"],
    [{ and: [null] }, "rule.and[0] must be a rule object"],
    [{ or: [[]] }, "rule.or[0] must be a rule object"],
  ];
  for (const [rule, problem] of cases) {
    assert.equal(problemOf(rule), `${SUBJECT}: ${problem}`);
  }
});

await test("a key the rule inherits dispatches nothing, as the compiler reads own keys", () => {
  const inheritedLogical = { __proto__: { and: 123 }, ...LEAF };
  assert.equal(problemOf(inheritedLogical), undefined);
  assert.equal(
    problemOf({ __proto__: LEAF }),
    `${SUBJECT}: rule must name an operator (and, or, not, equals, notEquals, in or notIn)`,
  );
});

await test("a rule nests at most 64 levels, however it nests", () => {
  const refusal =
    /^Malformed row rule: rule(\.not|\.and\[0\]|\.or\[0\])+ nests rules deeper than 64 levels$/;
  assert.equal(problemOf(nested(64, (inner) => ({ not: inner }))), undefined);
  assert.match(
    problemOf(nested(65, (inner) => ({ not: inner }))) ?? "",
    refusal,
  );
  assert.equal(problemOf(nested(64, (inner) => ({ and: [inner] }))), undefined);
  assert.match(
    problemOf(nested(65, (inner) => ({ or: [inner] }))) ?? "",
    refusal,
  );
});

await test("a rule nested far deeper, or looping back on itself, is refused rather than exhausting the stack", () => {
  const refusal = /nests rules deeper than 64 levels$/;
  assert.match(
    problemOf(nested(100_000, (inner) => ({ not: inner }))) ?? "",
    refusal,
  );
  /** @type {{ not?: unknown }} */
  const loop = {};
  loop.not = loop;
  assert.match(problemOf(loop) ?? "", refusal);
});

await test("the subject and the path prefix every refusal", () => {
  assert.throws(
    () => assertRowRule({ not: 1 }, "A summary has a malformed rule", "where"),
    new Error(
      "A summary has a malformed rule: where.not must be a rule object",
    ),
  );
});

await test("a rule 10,000 levels deep is refused quickly", () => {
  const cpuMilliseconds = startCpuClock();
  assert.match(
    problemOf(nested(10_000, (inner) => ({ not: inner }))) ?? "",
    /nests rules deeper than 64 levels$/,
  );
  assert.ok(cpuMilliseconds() < 1000);
});

await test("a list of 200,000 rules is walked within a time bound", () => {
  const cpuMilliseconds = startCpuClock();
  assert.equal(
    problemOf({ and: Array.from({ length: 200_000 }, () => LEAF) }),
    undefined,
  );
  assert.equal(
    problemOf({ or: Array.from({ length: 200_000 }, () => LEAF).concat([{}]) }),
    `${SUBJECT}: rule.or[200000] must name an operator (and, or, not, equals, notEquals, in or notIn)`,
  );
  assert.ok(cpuMilliseconds() < 2000);
});

await test("a 1 MiB body of rules 63 levels deep is walked with bounded time and memory", () => {
  const rules = [];
  let bytes = 0;
  while (bytes < 1024 * 1024) {
    const rule = nested(63, (inner) => ({ not: inner }));
    bytes += JSON.stringify(rule).length;
    rules.push(rule);
  }
  const rssBefore = process.memoryUsage().rss;
  const cpuMilliseconds = startCpuClock();
  assert.equal(problemOf({ and: rules }), undefined);
  assert.ok(cpuMilliseconds() < 2000);
  assert.ok(process.memoryUsage().rss - rssBefore < 100 * 1024 * 1024);
});
