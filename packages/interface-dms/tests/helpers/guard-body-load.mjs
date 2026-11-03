import assert from "node:assert/strict";
import { createGuardedConfirmRoute } from "../../dist/base/table-view/internal/guards.js";
import { TableViewMeta } from "../../dist/base/table-view/meta.js";
import { HTTPResult } from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";

const BODY_BYTES = 1024 * 1024;
const ENTRIES = 200_000;

/** @param {number} count */
const keys = (count) =>
  Array.from({ length: count }, (_, index) => `"k${index}":${index}`).join(",");

/**
 * @param {string} element
 * @returns {string} a body of `{"k":[element,element,...]}` about 1 MiB long
 */
const wide = (element) =>
  `{"k":[${Array(Math.floor(BODY_BYTES / (element.length + 1)))
    .fill(element)
    .join(",")}]}`;

/** @param {number} count */
const ones = (count) => Array(count).fill("1").join(",");

/** @param {number} levels */
const arrays = (levels) => "[".repeat(levels) + "]".repeat(levels);

/** @param {number} levels */
const objects = (levels) => '{"a":'.repeat(levels) + "1" + "}".repeat(levels);

/**
 * Bodies of about 1 MiB, the default raw body limit. The depth counts the body
 * object and the `k` array, so an element of N containers makes N + 2 levels.
 */
const BODIES = new Map([
  ["arrays-64", () => wide(arrays(62))],
  ["objects-64", () => wide(objects(62))],
  ["arrays-65", () => wide(arrays(63))],
  ["objects-65", () => wide(objects(63))],
  [
    "arrays-65-last",
    () => `{"k":[${ones(BODY_BYTES / 2 - 100)},${arrays(63)}]}`,
  ],
  ["flat-array", () => `{"k":[${ones(BODY_BYTES / 2 - 10)}]}`],
  ["array-200k-entries", () => `{"k":[${ones(ENTRIES)}]}`],
  ["object-200k-entries", () => `{"k":{${keys(ENTRIES)}}}`],
  ["body-200k-keys", () => `{${keys(ENTRIES)}}`],
]);

const build = BODIES.get(process.argv[2] ?? "");
assert.ok(build, `unknown body ${process.argv[2]}`);
const body = build();
class GuardedController {}
/** @type {unknown[]} */
const seen = [];
GetMetadata(GuardedController, TableViewMeta).setControllerGuards({
  delete: (_controller, args) => void seen.push(args.values),
});
const route = createGuardedConfirmRoute(
  { func: async () => "ok", args: [], method: "delete" },
  "delete",
);

const started = performance.now();
/** @type {number | string} */
let outcome = "decoded";
try {
  await route.func.call(
    new GuardedController(),
    {},
    { id: ["row-1"] },
    Buffer.from(body),
  );
  assert.equal(JSON.stringify(seen[0]), body);
} catch (error) {
  outcome = error instanceof HTTPResult ? error.getStatus() : String(error);
}
console.log(
  JSON.stringify({
    outcome,
    bodyBytes: body.length,
    milliseconds: Math.round(performance.now() - started),
    peakRssMb: Math.round(process.resourceUsage().maxRSS / 1024),
  }),
);
