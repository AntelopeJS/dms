import assert from "node:assert/strict";
import { memoryUsage } from "node:process";
import { test } from "node:test";
import { HTTPResult } from "@antelopejs/interface-api";
import { parseFormBody } from "../dist/form/demo-record-api.js";
import { PageFormSimple } from "../dist/form/simple/page.js";

const ONE_MIB = 1024 * 1024;
const MAX_MILLISECONDS = 500;
const MAX_RSS_GROWTH = 64 * ONE_MIB;
const LAYOUTS = ["many-keys", "wide-leaf"];

/** @typedef {import("@antelopejs/interface-dms/base/types").JsonValue} JsonValue */

/**
 * `depth` levels of list around `leaf`.
 *
 * @param {number} depth
 * @param {JsonValue} leaf
 * @returns {JsonValue}
 */
const nested = (depth, leaf) => {
  let value = leaf;
  for (let level = 0; level < depth; level++) value = [value];
  return value;
};

/**
 * A body of at least 1 MiB whose values nest `depth` deep: one chain per key
 * (`many-keys`), or one chain whose innermost list is the 1 MiB (`wide-leaf`).
 * When `known`, a chain is also sent under a field of the form.
 *
 * @param {string} layout
 * @param {number} depth
 * @param {boolean} known
 * @returns {Record<string, JsonValue>}
 */
const wideBody = (layout, depth, known) => {
  if (layout === "wide-leaf") {
    const leaf = Array.from({ length: ONE_MIB / 2 }, () => 1);
    return { [known ? "textField" : "unknown"]: nested(depth, leaf) };
  }
  const chainBytes = JSON.stringify(nested(depth, [])).length;
  /** @type {Record<string, JsonValue>} */
  const body = {};
  for (let index = 0; index < ONE_MIB / chainBytes; index++) {
    body[`unknown${index}`] = nested(depth, []);
  }
  if (known) body.textField = nested(depth, []);
  return body;
};

/** @param {Record<string, JsonValue>} body */
const answerOf = async (body) => {
  try {
    return await parseFormBody(PageFormSimple.form, body);
  } catch (error) {
    return error;
  }
};

for (const depth of [63, 64]) {
  for (const layout of LAYOUTS) {
    await test(`a 1 MiB body of ${layout} values nested ${depth} deep is answered fast`, async () => {
      for (const known of [false, true]) {
        const body = wideBody(layout, depth, known);
        assert.ok(JSON.stringify(body).length >= ONE_MIB, "the body is 1 MiB");
        const rssBefore = memoryUsage().rss;
        const started = performance.now();
        const answer = await answerOf(body);
        const milliseconds = performance.now() - started;
        const rssGrowth = memoryUsage().rss - rssBefore;
        assert.ok(milliseconds < MAX_MILLISECONDS, `${milliseconds} ms`);
        assert.ok(rssGrowth < MAX_RSS_GROWTH, `${rssGrowth} bytes of rss`);
        if (known) {
          assert.ok(answer instanceof HTTPResult, String(answer));
          assert.equal(answer.getStatus(), 400);
        } else {
          assert.deepEqual(answer, {});
        }
      }
    });
  }
}
